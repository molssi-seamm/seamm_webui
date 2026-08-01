"""Job endpoints.

Phase 1 scaffold: real, paginated listing + single-job lookup, reusing
seamm_datastore's existing Job.get()/get_by_id() as-is. Submission and file
endpoints are tracked in dashboard-rewrite-plan.md's Phase 1 checklist and
land in a follow-up pass, not this scaffold.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from seamm_webui.auth import require_permission

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


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
    from seamm_datastore.database.models import Job
    from seamm_datastore.database.schema import JobSchema

    job = Job.get_by_id(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return JobSchema(many=False).dump(job)
