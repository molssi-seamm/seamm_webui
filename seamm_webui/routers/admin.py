"""User-management endpoints for seamm_webui's "local" auth mode.

Web equivalent of manage.py's seamm-webui-user CLI (create/list/
set-password/delete) -- same underlying seamm_datastore.User calls, same
capabilities, nothing more. Role/group management is deliberately not
here: every account so far is created with the "admin" role outright (see
require_admin's docstring), matching Phase 3's "prove who you are, not
partition who sees what" -- a role picker would be UI for a decision that
doesn't exist yet.

Every route requires the admin role (require_admin, not just
require_permission) -- this manages *other* accounts' credentials, a
materially bigger blast radius than the rest of the API.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from seamm_webui.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/admin/users", tags=["admin"])


class UserCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class SetPassword(BaseModel):
    password: str


def _serialize(user) -> dict:
    return {
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "roles": [role.name for role in user.roles],
    }


@router.get("")
def list_users(_: None = Depends(require_admin())):
    from seamm_datastore.database.models import User

    return [_serialize(u) for u in User.query.order_by(User.username).all()]


@router.post("", status_code=201)
def create_user(payload: UserCreate, _: None = Depends(require_admin())):
    from seamm_webui.db import get_datastore

    # seamm_datastore.User.create() raises ValueError for a duplicate
    # username, but `email` is a unique column too -- an empty string
    # (rather than the null the frontend means) would collide the second
    # time someone leaves it blank, so normalize the same way the rest of
    # the API treats optional strings.
    from seamm_datastore.database.models import User

    try:
        user = User.create(
            username=payload.username,
            password=payload.password,
            first_name=payload.first_name or None,
            last_name=payload.last_name or None,
            email=payload.email or None,
            roles=["admin"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    ds = get_datastore()
    ds.Session.add(user)
    ds.Session.commit()
    return _serialize(user)


def _get_user_or_404(username: str):
    from seamm_datastore.database.models import User

    user = User.query.filter_by(username=username).one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail=f"No such user {username!r}")
    return user


@router.post("/{username}/set-password")
def set_password(
    username: str, payload: SetPassword, _: None = Depends(require_admin())
):
    from seamm_webui.db import get_datastore

    user = _get_user_or_404(username)
    user.password = payload.password
    get_datastore().Session.commit()
    return _serialize(user)


@router.delete("/{username}", status_code=204)
def delete_user(username: str, request: Request, _: None = Depends(require_admin())):
    from seamm_webui.db import get_datastore

    user = _get_user_or_404(username)

    # This alone is what keeps the datastore from ever losing its last
    # admin through this endpoint: reaching this line already required
    # being logged in as an admin (require_admin), and this guard stops
    # that admin from being the one deleted -- so the acting admin is
    # always still there afterward. A separate "don't delete the last
    # admin" count would be unreachable dead code layered on top of that.
    if username == get_current_user(request):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    ds = get_datastore()
    ds.Session.delete(user)
    ds.Session.commit()
