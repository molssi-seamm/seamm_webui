"""Project endpoints.

Phase 1 scaffold: minimal read-only listing, just enough to pick a
submission target. Full project management is Phase 2.
"""

from fastapi import APIRouter, Depends

from seamm_webui.auth import require_permission

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("")
def list_projects(_: None = Depends(require_permission("read"))):
    from seamm_datastore.database.models import Project
    from seamm_datastore.database.schema import ProjectSchema

    projects = Project.get(permission="read")
    return ProjectSchema(many=True).dump(projects)
