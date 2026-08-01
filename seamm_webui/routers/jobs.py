"""Job endpoints.

Real, paginated listing + single-job lookup + file listing/download +
submission, reusing seamm_datastore's existing Job.get()/get_by_id()/create()
as-is.
"""

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from seamm_webui.auth import require_permission

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class JobSubmission(BaseModel):
    flowchart: str
    project: str = "default"
    title: str
    description: str = ""
    parameters: dict = Field(default_factory=dict)


def _get_job_or_404(job_id: int):
    from seamm_datastore.database.models import Job

    job = Job.get_by_id(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return job


@router.get("")
def list_jobs(
    offset: Optional[int] = None,
    limit: Optional[int] = None,
    sort_by: str = "id",
    order: str = "asc",
    _: None = Depends(require_permission("read")),
):
    from seamm_datastore.database.models import Job
    from seamm_datastore.database.schema import JobSchema

    jobs = Job.get(
        permission="read",
        offset=offset,
        limit=limit,
        sort_by=sort_by,
        order=order,
    )
    return JobSchema(many=True).dump(jobs)


@router.post("")
def submit_job(
    submission: JobSubmission, _: None = Depends(require_permission("create"))
):
    """Submit a new job.

    Writes flowchart.flow + job_data.json to the project directory (mirroring
    seamm_dashboard's add_job / setup_job) and registers it via Job.create().
    No separate "enqueue" step -- the seamm_jobserver daemon picks up jobs
    with status "submitted" on its own, independent of which dashboard wrote
    them.
    """
    from seamm_datastore.database.models import Job
    from seamm_datastore.database.schema import JobSchema
    from seamm_webui.db import get_datastore, get_datastore_dir
    from seamm_webui.util import get_job_id, write_job_files

    datastore_dir = get_datastore_dir()
    job_id_file = str(Path(datastore_dir).expanduser() / "job.id")
    job_id = get_job_id(job_id_file)

    project_names = [submission.project]
    parameters = submission.parameters or {"cmdline": []}

    directory = write_job_files(
        datastore_dir,
        submission.project,
        job_id,
        submission.flowchart,
        submission.title,
        project_names,
        parameters,
    )

    try:
        job = Job.create(
            job_id,
            path=directory,
            flowchart_filename=str(Path(directory) / "flowchart.flow"),
            project_names=project_names,
            title=submission.title,
            description=submission.description,
            parameters=parameters,
        )
    except NameError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    ds = get_datastore()
    ds.Session.add(job)
    ds.Session.commit()

    return JobSchema(many=False).dump(job)


@router.get("/{job_id}")
def get_job(job_id: int, _: None = Depends(require_permission("read"))):
    from seamm_datastore.database.schema import JobSchema

    job = _get_job_or_404(job_id)
    return JobSchema(many=False).dump(job)


@router.get("/{job_id}/files")
def list_job_files(job_id: int, _: None = Depends(require_permission("read"))):
    """List files under the job's directory, as relative paths + sizes."""
    job = _get_job_or_404(job_id)

    base = Path(job.path)
    if not base.is_dir():
        return []

    files = []
    for path in sorted(base.rglob("*")):
        if path.is_file():
            files.append(
                {
                    "path": str(path.relative_to(base)),
                    "size": path.stat().st_size,
                }
            )
    return files


@router.get("/{job_id}/files/download")
def download_job_file(
    job_id: int, filename: str, _: None = Depends(require_permission("read"))
):
    """Download a single file from the job's directory.

    ``filename`` is resolved and checked against ``job.path`` with
    ``is_relative_to`` (not a substring check like the old dashboard's
    ``"../" in filename``) so it can't escape the job directory regardless of
    how the traversal is encoded.
    """
    job = _get_job_or_404(job_id)

    base = Path(job.path).resolve()
    target = (base / filename).resolve()

    if not target.is_relative_to(base):
        raise HTTPException(status_code=403, detail="Invalid filename")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(target, filename=target.name)
