"""Authentication for seamm_webui.

Two modes (see main.py's --auth flag and dashboard-rewrite-plan.md, Phase 3):

- "none" -- no login at all; every request acts as the fixed built-in
  identity. Default when bound to loopback; main.py refuses to start this
  mode on any other host.
- "local" -- real per-user login via a signed session cookie, checked
  against seamm_datastore's existing User/password_hash (proper salted
  hashing, already there -- see models.py's User.verify_password).

Both modes funnel through require_permission(), the FastAPI dependency
every route already depends on -- adding a third mode later (e.g. an
OIDC front door) is a change to this file, not to route code.

Deliberately no separate CSRF-cookie mechanism (unlike the old
seamm_dashboard's flask_jwt_extended double-submit setup): this is a
JSON-only API behind CORS locked to known origins, so an httpOnly,
SameSite=Lax session cookie closes the same gap a CSRF token would,
without a second cookie that can collide with another seamm-webui
instance's (see init_auth's cookie-name note).
"""

from typing import Literal, Optional

from fastapi import HTTPException, Request, Response
from itsdangerous import BadSignature, URLSafeTimedSerializer

from seamm_webui.db import set_current_user

# The identity every request uses in "none" mode -- the same fixed account
# Phase 1/2 always logged in as at startup, just now set explicitly on
# every request instead of once for the whole process (see
# db.py's set_current_user/contextvar patch).
NONE_MODE_USERNAME = "admin"

# ~2 weeks: scientists may check back on a job days later and shouldn't
# have to re-login for that. A visible Log out control (frontend) handles
# the case where someone actively wants to end their session sooner.
SESSION_MAX_AGE = 14 * 24 * 60 * 60

AuthMode = Literal["none", "local"]

_auth_mode: Optional[AuthMode] = None
_serializer: Optional[URLSafeTimedSerializer] = None
_cookie_name: Optional[str] = None
_cookie_secure = False


def init_auth(mode: AuthMode, secret_key: str, cookie_name: str, secure: bool = False):
    """Configure auth for this process. Called once from main.py's
    create_app(), before any request is served.

    ``cookie_name`` should be unique per running instance (main.py derives
    it from the port) -- browser cookies are scoped by domain only, not
    port, so two seamm-webui instances both reachable as `localhost` (a
    local one plus an SSH-tunneled cluster one, say) would otherwise
    silently overwrite each other's session cookie.

    In "none" mode, also sets an ambient default identity for the whole
    process (not just per-request, which require_permission already does)
    -- there's no security boundary in this mode to protect, so code that
    talks to the datastore directly rather than through an HTTP request
    (test fixtures, scripts using seamm_webui.db.init_datastore() directly)
    should just work the way it always did in Phase 1/2, without needing
    its own request to go through require_permission first. "local" mode
    deliberately does *not* do this -- db.py's contextvar default stays
    None there, so anything that reaches a permission check without going
    through require_permission fails closed, not open.
    """
    global _auth_mode, _serializer, _cookie_name, _cookie_secure
    _auth_mode = mode
    _serializer = URLSafeTimedSerializer(secret_key, salt="seamm-webui-session")
    _cookie_name = cookie_name
    _cookie_secure = secure

    if mode == "none":
        set_current_user(NONE_MODE_USERNAME)


def get_auth_mode() -> AuthMode:
    if _auth_mode is None:
        raise RuntimeError("Auth not initialized; call init_auth() at app startup.")
    return _auth_mode


def get_current_user(request: Request) -> Optional[str]:
    """Return the username this request's session cookie asserts, or None
    if there isn't one, or it's missing/tampered/expired. Doesn't raise --
    callers (require_permission, GET /api/auth/me) decide what "no
    identity" means for them.
    """
    if _auth_mode == "none":
        return NONE_MODE_USERNAME

    token = request.cookies.get(_cookie_name)
    if not token:
        return None
    try:
        data = _serializer.loads(token, max_age=SESSION_MAX_AGE)
    except BadSignature:
        # Covers both a tampered/garbage cookie and an expired one
        # (SignatureExpired is a BadSignature subclass) -- both just mean
        # "not logged in," not an error.
        return None
    return data.get("username")


def create_session_cookie(response: Response, username: str) -> None:
    token = _serializer.dumps({"username": username})
    response.set_cookie(
        _cookie_name,
        token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=_cookie_secure,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(_cookie_name, path="/")


def require_permission(action: str):
    """FastAPI dependency factory: establish who's making this request (for
    seamm_datastore's permission checks -- db.py's set_current_user) and,
    in "local" mode, reject if nobody's logged in.

    ``action`` (e.g. "read", "update") is accepted so call sites already
    read the way they will if this ever needs to check it, but it isn't
    checked here -- fine-grained authorization (who can see/touch what) is
    seamm_datastore's existing owner/group permission model, which starts
    applying for real the moment a real per-request identity is set here;
    this dependency only answers "is anyone logged in at all."
    """

    # Must be async, not a plain sync function -- a sync dependency runs in
    # Starlette's threadpool (anyio.to_thread.run_sync), which copies the
    # current contextvars.Context into that thread; set_current_user's
    # mutation would land in that copy and be discarded when the thread
    # finishes, invisible to the route handler's own (separately copied)
    # thread. An async dependency runs in-line in the request's own task,
    # so its mutation is part of the context every later step -- including
    # a sync route handler's threadpool copy -- actually inherits. (Found
    # this the hard way: every route that touches the database failed with
    # "not authorized" in "none" mode until this was made async.)
    async def _check(request: Request) -> None:
        if _auth_mode == "none":
            set_current_user(NONE_MODE_USERNAME)
            return

        username = get_current_user(request)
        if username is None:
            raise HTTPException(status_code=401, detail="Login required")
        set_current_user(username)

    return _check
