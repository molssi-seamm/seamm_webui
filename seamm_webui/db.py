"""Datastore connection management for seamm_webui.

IMPORTANT ordering constraint: ``init_datastore()`` must run before anything
else in this process imports ``seamm_datastore.database.models`` (directly or
transitively, e.g. via a router). ``seamm_datastore``'s internal
``flask_authorize_patch`` decides -- the *first* time it is imported in a
process -- whether to bind to a real Flask ``current_app`` or to the
standalone ``fake_app`` shim that ``SEAMMDatastore.__init__`` sets up. Since
we have no Flask app, importing the models before ``init_datastore()`` has
run would leave that patch trying to use Flask's real (app-context-less)
``current_app`` proxy and crash. ``main.py`` calls ``init_datastore()`` first
and only then imports the routers, which is what keeps this safe.
"""

import contextvars
from pathlib import Path
from typing import Optional

import seamm_datastore

_datastore: Optional["seamm_datastore.connect"] = None
_datastore_dir: Optional[str] = None

# Phase 3: who seamm_datastore's permission checks see as "logged in", made
# request-scoped instead of living on the one shared SEAMMDatastore
# connection object every request uses. See _patch_current_user_to_contextvar
# below for why this is necessary and how it works.
_current_username: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "seamm_webui_current_username", default=None
)


def set_current_user(username: Optional[str]) -> None:
    """Set the identity seamm_datastore's permission checks will see for the
    rest of the current request (or, outside of a request, the rest of the
    current context). ``seamm_webui.auth``'s ``require_permission`` calls
    this once it's established who's making the request -- the fixed
    built-in identity in "none" mode, or the verified session cookie's
    username in "local" mode. Deliberately does *not* go through
    ``SEAMMDatastore.login()`` (which re-verifies a password) since a valid
    session cookie already proved identity.
    """
    _current_username.set(username)


def _patch_current_user_to_contextvar():
    """Make ``SEAMMDatastore._user`` request-scoped.

    ``seamm_datastore.connect.SEAMMDatastore.login()``/``.logout()``/
    ``.current_user()`` just read and write a plain ``self._user`` string
    attribute, and the constructor does
    ``self.authorize = Authorize(current_user=self.current_user)`` -- a
    bound method flask_authorize calls fresh on every permission check, not
    a value captured once. That's exactly right for one shared connection
    object serving one process-wide identity (Phase 1/2's fixed admin
    login), and exactly wrong once real per-user logins mean two different
    people can be logged in at the same time: ``self._user`` is a single
    mutable attribute on the *one* datastore connection every request in
    this FastAPI process shares, so without this patch, one request's login
    would leak into every other concurrent request's permission checks.

    Fix, without touching the seamm_datastore package itself: replace the
    plain instance attribute with a class-level ``property`` backed by a
    ``contextvars.ContextVar``. FastAPI/Starlette gives each request its own
    ``contextvars.Context`` (correctly propagated into ``run_in_threadpool``
    for sync routes too), so this makes "current user" request-isolated
    while every request still shares the same underlying datastore
    connection/engine/session pool -- nothing else about how
    ``login()``/``logout()``/``current_user()`` are written needs to change,
    since they already only ever do ``self._user = ...`` / ``if
    self._user``.

    Called before ``seamm_datastore.connect()`` so even the constructor's
    own ``self._user = None`` (when no ``username=`` is passed, our case)
    goes through the property.
    """
    from seamm_datastore.connect import SEAMMDatastore

    def _get_user(self):
        return _current_username.get()

    def _set_user(self, value):
        _current_username.set(value)

    SEAMMDatastore._user = property(_get_user, _set_user)


def init_datastore(datastore_dir: str, default_project: str = "default"):
    """Connect to the SEAMM datastore at ``datastore_dir``.

    NOTE: this must be the *datastore* directory (what the rest of SEAMM
    calls ``--datastore``, default ``${root}/Jobs``), not the general
    ``--root`` SEAMM config directory (default ``~/SEAMM``, holding the
    per-code ``.ini`` files) -- those are two different, separately
    configurable directories. Conflating them was a real bug here during
    scaffolding: pointing this at ``~/SEAMM`` directly found no
    ``seamm.db``, silently created a fresh empty one there, and connected
    to that instead of the real datastore at ``~/SEAMM/Jobs/seamm.db``. See
    ``main.py``'s ``--root``/``--datastore`` handling, which mirrors
    ``seamm_util.argument_parser``'s ``${root}/Jobs`` default.

    Only initializes (creates tables/default project/roles) if there is no
    existing ``seamm.db`` at that location yet -- an existing datastore
    (e.g. the one the old ``seamm_dashboard`` already uses) is connected to
    as-is, never dropped/recreated.

    Identity is deliberately left unset here (no ``login()`` call) --
    ``_current_username``'s own ``default=None`` means any request that
    somehow reaches a permission check without going through
    ``seamm_webui.auth.require_permission`` first fails closed (looks
    logged-out), not open (looks like the admin account). Establishing who's
    making a given request is entirely ``require_permission``'s job now
    (Phase 3) -- see ``seamm_webui/auth.py``.
    """
    global _datastore, _datastore_dir

    root = Path(datastore_dir).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    db_path = root / "seamm.db"
    initialize = not db_path.exists()

    _patch_current_user_to_contextvar()

    # Note: NOT passing username= here on purpose. seamm_datastore.connect()
    # has a bug (connect.py:201, `self.add_user` does not exist) that's hit
    # when `initialize=True` and a `username` is passed to the constructor
    # itself -- see https://github.com/molssi-seamm/seamm_datastore (file an
    # issue). Not logging in at all (see docstring above) avoids that code
    # path entirely and works whether this connection just created the
    # datastore or is attaching to an existing one.
    _datastore = seamm_datastore.connect(
        database_uri=f"sqlite:///{db_path}",
        datastore_location=str(root),
        initialize=initialize,
        default_project=default_project,
    )

    _datastore_dir = str(root)

    return _datastore


def get_datastore():
    if _datastore is None:
        raise RuntimeError(
            "Datastore not initialized; call init_datastore() at app startup."
        )
    return _datastore


def get_datastore_dir() -> str:
    if _datastore_dir is None:
        raise RuntimeError(
            "Datastore not initialized; call init_datastore() at app startup."
        )
    return _datastore_dir
