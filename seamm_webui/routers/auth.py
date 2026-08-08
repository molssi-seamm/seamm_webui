"""Login/logout/current-user endpoints for seamm_webui.

Deliberately not behind ``require_permission()`` like every other route --
these have to be callable while logged out (that's the point of ``/me``,
which the frontend polls on load to decide whether to show a login page at
all).
"""

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from seamm_webui.auth import (
    clear_session_cookie,
    create_session_cookie,
    get_auth_mode,
    get_current_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
@router.post(
    "/token"
)  # alias: what seamm_dashboard_client's Dashboard.login() posts to
def login(payload: LoginRequest, response: Response):
    from seamm_datastore.database.models import User

    user = User.query.filter_by(username=payload.username).one_or_none()
    if user is None or not user.verify_password(payload.password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    create_session_cookie(response, user.username)
    return {"username": user.username}


@router.post("/logout")
def logout(response: Response):
    clear_session_cookie(response)
    return {"logged_out": True}


@router.get("/me")
def me(request: Request):
    """Who's logged in, and whether the frontend needs to ask -- "none"
    mode always reports no username (there's nothing to log in as, even
    though internally requests run as a fixed identity; see
    auth.NONE_MODE_USERNAME), so the frontend never needs to special-case
    the mode itself beyond this one field.
    """
    mode = get_auth_mode()
    username = None if mode == "none" else get_current_user(request)
    return {"auth_mode": mode, "username": username}
