"""Job endpoints.

Real, paginated listing + single-job lookup + file listing/download, reusing
seamm_datastore's existing Job.get()/get_by_id() as-is. Job submission is
still tracked in dashboard-rewrite-plan.md's Phase 1 checklist and lands in a
follow-up pass, not this one.
"""

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from seamm_webui.auth import require_permission

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


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
