"""Permission stub for seamm_webui.

Phase 1 is single-user with no real authentication. Every route depends on
``require_permission(...)`` rather than checking anything inline, so that
swapping in real per-user auth later (Phase 3, see
``dashboard-rewrite-plan.md``) means replacing the body of these two
functions, not touching route code.

The corresponding datastore-layer stub -- allowing anonymous actions in
flask_authorize -- is set in ``seamm_webui.db.init_datastore()``.
"""

from typing import Optional


def get_current_user() -> Optional[str]:
    """Return the identity of the current user.

    Always ``None`` (anonymous) until Phase 3 adds real login.
    """
    return None


def require_permission(action: str):
    """FastAPI dependency factory: require ``action`` permission on a resource.

    Always allows, for now. ``action`` is accepted (e.g. "read", "update")
    so call sites already read the way they will once this enforces real
    permissions.
    """

    def _check() -> None:
        return None

    return _check
