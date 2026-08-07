"""Project endpoints.

Listing + full CRUD (Phase 2), reusing seamm_datastore's existing
Project.create()/Project.update()/get_by_id() as-is, the same pattern
routers/jobs.py already uses for jobs.
"""

import shutil
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from seamm_webui.auth import require_permission

router = APIRouter(prefix="/api/projects", tags=["projects"])

# Job statuses that mean "still doing something" -- used only to warn on
# project deletion (see delete_project below), not to block it.
ACTIVE_JOB_STATUSES = ("submitted", "running")


class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


def _get_project_or_404(project_id: int, permission: str = "read"):
    from seamm_datastore.database.models import Project

    project = Project.get_by_id(project_id, permission=permission)
    if project is None:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")
    return project


@router.get("")
def list_projects(_: None = Depends(require_permission("read"))):
    from seamm_datastore.database.models import Project
    from seamm_datastore.database.schema import ProjectSchema

    projects = Project.get(permission="read")
    return ProjectSchema(many=True).dump(projects)


@router.post("")
def create_project(
    submission: ProjectCreate, _: None = Depends(require_permission("create"))
):
    """Create a project, mirroring the old dashboard's add_project: a
    directory under ``<datastore>/projects/<name>`` plus the DB row.
    """
    from seamm_datastore.database.models import Project
    from seamm_datastore.database.schema import ProjectSchema
    from seamm_webui.db import get_datastore, get_datastore_dir

    directory = Path(get_datastore_dir()).expanduser() / "projects" / submission.name
    directory.mkdir(parents=True, exist_ok=True)

    try:
        project = Project.create(
            name=submission.name,
            description=submission.description,
            path=str(directory),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    ds = get_datastore()
    ds.Session.add(project)
    ds.Session.commit()

    return ProjectSchema(many=False).dump(project)


@router.get("/{project_id}")
def get_project(project_id: int, _: None = Depends(require_permission("read"))):
    from seamm_datastore.database.schema import ProjectSchema

    project = _get_project_or_404(project_id)
    return ProjectSchema(many=False).dump(project)


@router.patch("/{project_id}")
def update_project(
    project_id: int,
    update: ProjectUpdate,
    _: None = Depends(require_permission("update")),
):
    from sqlalchemy.exc import IntegrityError

    from seamm_datastore.database.models import Project
    from seamm_datastore.database.schema import ProjectSchema
    from seamm_webui.db import get_datastore

    _get_project_or_404(project_id, permission="update")

    ds = get_datastore()

    # Project.update() doesn't check for a duplicate name the way
    # Project.create() does (it relies on the DB's unique constraint, which
    # its own bulk UPDATE statement violates immediately -- not deferred to
    # a later commit), and -- unlike the old Flask app, which committed
    # implicitly at request teardown -- doesn't commit on success either;
    # both are handled here.
    try:
        Project.update(project_id, name=update.name, description=update.description)
        ds.Session.commit()
    except IntegrityError:
        ds.Session.rollback()
        raise HTTPException(
            status_code=400, detail=f"A project named {update.name!r} already exists"
        )

    project = _get_project_or_404(project_id)
    return ProjectSchema(many=False).dump(project)


@router.delete("/{project_id}")
def delete_project(project_id: int, _: None = Depends(require_permission("delete"))):
    """Delete a project: removes the DB row AND its directory on disk (all
    job files), matching the old dashboard's delete_project.

    Any of the project's jobs still "submitted"/"running" are explicitly
    set to status "kill" first, the same request routers/jobs.py's
    kill_job makes -- seamm_jobserver's check_for_stopped_jobs() polls for
    that and stops them. This is *not* a side effect of deleting the
    project/job-project association: deleting a Project only removes rows
    from the job_project join table (confirmed empirically -- a job's own
    row, status, and `jobs` table membership are untouched by deleting its
    project), so seamm_jobserver's other trigger, a job's row vanishing
    entirely from the `jobs` table, does NOT fire here and can't be relied
    on. The explicit status="kill" below is what actually stops these jobs
    before their files disappear out from under them.
    """
    from seamm_datastore.database.models import Job
    from seamm_webui.db import get_datastore, get_datastore_dir

    project = _get_project_or_404(project_id, permission="delete")

    active_jobs = [
        {"id": j.id, "title": j.title, "status": j.status}
        for j in project.jobs
        if j.status in ACTIVE_JOB_STATUSES
    ]

    for aj in active_jobs:
        Job.update(aj["id"], status="kill")

    if project.path:
        target = Path(project.path).resolve()
        datastore_root = Path(get_datastore_dir()).expanduser().resolve()
        if target.is_relative_to(datastore_root) and target.is_dir():
            shutil.rmtree(target)

    ds = get_datastore()
    ds.Session.delete(project)
    ds.Session.commit()

    return {"deleted": True, "active_jobs": active_jobs}
