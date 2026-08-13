"""Job endpoints.

Real, paginated listing + single-job lookup + file listing/download +
submission, reusing seamm_datastore's existing Job.get()/get_by_id()/create()
as-is.
"""

import shutil
import time
from pathlib import Path
from typing import List, Optional

import fasteners
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from seamm_slurm.stage import STAGE_LOCK_FILENAME, StageError

from seamm_webui.auth import require_permission

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

# How often (seconds) a given job's remote files can actually be re-synced
# for real -- see sync_job_files(). In-memory/per-process: worst case after
# a restart is one extra real sync, not a correctness issue, so this
# doesn't need to survive restarts or be shared across workers.
SYNC_MIN_INTERVAL = 15
_last_synced: dict = {}


class JobSubmission(BaseModel):
    flowchart: str
    project: str = "default"
    title: str
    description: str = ""
    parameters: dict = Field(default_factory=dict)


class JobIds(BaseModel):
    ids: List[int]


MAX_PREVIEW_BYTES = 2_000_000

# Job statuses seamm_jobserver will actually act on when asked to kill --
# matches its own check_for_stopped_jobs() (jobserver.py), which polls for
# status == "kill" and, separately, still-"running" jobs whose datastore
# row vanished. A job in any other status has either not started running
# under a jobserver yet in a way that matters, or is already done, so there
# is nothing for a kill request to stop.
KILLABLE_STATUSES = ("submitted", "running")


def _get_job_or_404(job_id: int, permission: str = "read"):
    from seamm_datastore.database.models import Job

    job = Job.get_by_id(job_id, permission=permission)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return job


def _kill_if_possible(job) -> bool:
    """Request a stop for ``job`` if it's in a status seamm_jobserver will
    actually act on. Returns whether it did; callers decide whether "no"
    is an error (the single-job endpoint) or just skipped (bulk).
    """
    from seamm_datastore.database.models import Job

    if job.status not in KILLABLE_STATUSES:
        return False
    Job.update(job.id, status="kill")
    return True


def _delete_job_files_and_row(job) -> None:
    """Remove a job's directory from disk (if it's safely inside the
    datastore) and mark its row for deletion. Does not commit -- callers
    (single or bulk) control commit timing.

    Deleting the row is itself what stops a running job: unlike deleting a
    project (which only clears the job_project association -- confirmed
    empirically, see routers/projects.py's delete_project), removing a
    Job's own row makes it vanish from the `jobs` table, which
    seamm_jobserver's check_for_stopped_jobs() polls for and treats as "was
    stopped out from under me" for anything it's actively tracking. No
    separate status="kill" request needed here.
    """
    from seamm_webui.db import get_datastore, get_datastore_dir

    if job.path:
        target = Path(job.path).resolve()
        datastore_root = Path(get_datastore_dir()).expanduser().resolve()
        if target.is_relative_to(datastore_root) and target.is_dir():
            shutil.rmtree(target)

    ds = get_datastore()
    ds.Session.delete(job)


def _resolve_job_file(job, filename: str) -> Path:
    """Resolve ``filename`` under the job's directory, guarding against
    traversal outside it via ``Path.is_relative_to`` (not a substring check
    like the old dashboard's ``"../" in filename``, which can't be bypassed
    by how the traversal is encoded).
    """
    base = Path(job.path).resolve()
    target = (base / filename).resolve()

    if not target.is_relative_to(base):
        raise HTTPException(status_code=403, detail="Invalid filename")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return target


@router.get("")
def list_jobs(
    response: Response,
    offset: Optional[int] = None,
    limit: Optional[int] = None,
    sort_by: str = "id",
    order: str = "asc",
    project: Optional[str] = None,
    status: Optional[str] = None,
    title: Optional[str] = None,
    queue: Optional[str] = None,
    _: None = Depends(require_permission("read")),
):
    """List jobs, optionally filtered to a single project by name, plus
    status/title/queue -- all applied before pagination, same reasoning as
    the project filter below: filtering Job.get()'s already-paginated
    results after the fact would make "page 2 of running jobs" not
    actually be the second page of running jobs.

    seamm_datastore's Job.get() only has title/description filters (both
    substring), not project/status/queue, so this builds the same
    permission-filtered query it uses internally (Job.permissions_query)
    directly rather than going through it.

    The total matching count (before offset/limit) goes in an
    ``X-Total-Count`` response header, not the JSON body -- so the body
    stays a plain array (what the frontend/seamm_dashboard_client's own
    callers already expect) while still giving JobsPage enough to jump to
    the last page rather than only ever knowing "is there a next page."
    """
    from seamm_datastore.database.models import Job, Project
    from seamm_datastore.database.schema import JobSchema

    query = Job.permissions_query("read")

    if project is not None:
        query = query.filter(Job.projects.any(Project.name == project))
    if status is not None:
        query = query.filter(Job.status == status)
    if title is not None:
        query = query.filter(Job.title.contains(title))
    if queue is not None:
        # parameters is a JSON column (seamm_jobserver's multi-queue
        # routing writes parameters["queue"], not a real column) --
        # .as_string() extracts it as text for comparison. Absent for any
        # job that predates that feature or wasn't routed, which just
        # never matches a queue filter, same as the frontend already
        # treating a missing queue as "--" rather than an error.
        query = query.filter(Job.parameters["queue"].as_string() == queue)

    response.headers["X-Total-Count"] = str(query.count())

    column = getattr(Job, sort_by)
    query = query.order_by(column.desc() if order.lower() == "desc" else column)

    if offset is not None:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)

    return JobSchema(many=True).dump(query.all())


@router.post("", status_code=201)
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


@router.post("/{job_id}/kill")
def kill_job(job_id: int, _: None = Depends(require_permission("update"))):
    """Ask seamm_jobserver to stop this job, keeping its files -- unlike
    deleting the job's project, which removes them (routers/projects.py's
    delete_project).

    This only *requests* the stop by setting status to "kill"; it doesn't
    perform it. seamm_jobserver's check_for_stopped_jobs() polls for
    status == "kill" every cycle, issues the actual local-process-kill/
    scancel, and then flips status to "killed" itself. So the job's status
    in the response here will be "kill", not yet "killed" -- the frontend
    should treat both as "a kill is in flight or done", not poll this
    endpoint waiting for "killed" synchronously.
    """
    from seamm_datastore.database.schema import JobSchema
    from seamm_webui.db import get_datastore

    job = _get_job_or_404(job_id, permission="update")
    if not _kill_if_possible(job):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot kill a job with status {job.status!r}",
        )

    get_datastore().Session.commit()

    return JobSchema(many=False).dump(_get_job_or_404(job_id))


@router.post("/kill")
def kill_jobs(payload: JobIds, _: None = Depends(require_permission("update"))):
    """Bulk version of kill_job, for the job list's "Kill selected".

    Silently skips anything not killable (already finished, nonexistent,
    no permission) rather than failing the whole batch over one job that
    was already done -- that's the point of a bulk action. ``skipped``
    distinguishes "found but not in a killable status" from ``not_found``
    ("no such job / no permission"), so the frontend can say something more
    useful than "some jobs were skipped."
    """
    from seamm_datastore.database.models import Job
    from seamm_webui.db import get_datastore

    killed: List[int] = []
    skipped: List[int] = []
    not_found: List[int] = []

    for job_id in payload.ids:
        job = Job.get_by_id(job_id, permission="update")
        if job is None:
            not_found.append(job_id)
        elif _kill_if_possible(job):
            killed.append(job_id)
        else:
            skipped.append(job_id)

    get_datastore().Session.commit()

    return {"killed": killed, "skipped": skipped, "not_found": not_found}


@router.delete("/{job_id}")
def delete_job(job_id: int, _: None = Depends(require_permission("delete"))):
    """Delete a job: removes the DB row AND its directory on disk,
    matching the old dashboard's delete_job. No status restriction (same
    as the old dashboard) -- deleting a still-running job is allowed, and
    is itself what stops it (see _delete_job_files_and_row).
    """
    from seamm_webui.db import get_datastore

    job = _get_job_or_404(job_id, permission="delete")
    _delete_job_files_and_row(job)
    get_datastore().Session.commit()

    return {"deleted": True}


@router.post("/delete")
def delete_jobs(payload: JobIds, _: None = Depends(require_permission("delete"))):
    """Bulk version of delete_job, for the job list's "Delete selected"."""
    from seamm_datastore.database.models import Job
    from seamm_webui.db import get_datastore

    deleted: List[int] = []
    not_found: List[int] = []

    for job_id in payload.ids:
        job = Job.get_by_id(job_id, permission="delete")
        if job is None:
            not_found.append(job_id)
        else:
            _delete_job_files_and_row(job)
            deleted.append(job_id)

    get_datastore().Session.commit()

    return {"deleted": deleted, "not_found": not_found}


@router.post("/{job_id}/sync")
def sync_job_files(job_id: int, _: None = Depends(require_permission("read"))):
    """Pull a still-running ``transport = ssh`` job's remote files back on
    demand, reusing the same ``seamm_slurm.stage`` machinery
    ``seamm_jobserver`` itself uses at job-terminal time -- so the file
    tree/viewer doesn't stay empty (or stale) for a remote job's entire
    runtime, only pulling for real once it finishes.

    Independent of the JobServer process: this Dashboard already reads
    the same ``<root>/<jobserver-name>.ini`` it does (``queue_config.py``,
    also used by ``GET /api/queues``), so it can recompute the job's
    remote path itself (``SlurmSection.remote_wdir_for()``) and build its
    own stager, rather than signaling the JobServer and waiting for its
    next poll cycle.

    A no-op (``synced: false``, never an error), not a 4xx/5xx, for
    anything that isn't a real remote-ssh job right now: no queue
    recorded, an unknown/removed queue, or a ``type=local``/
    ``transport=local`` queue (nothing to pull -- the JobServer already
    shares this filesystem). Also a no-op, throttled, if called again for
    the same job within ``SYNC_MIN_INTERVAL`` -- protects against
    multiple tabs/users or a tight status-poll loop hammering ssh+rsync.
    Gated on ``require_permission("read")``, not ``"update"``: the effect
    is refreshing what's visible, not changing job state, even though it
    writes files to disk.

    Guarded by a ``fasteners.InterProcessLock`` on the same
    ``STAGE_LOCK_FILENAME`` ``seamm_jobserver``'s own end-of-run pull
    locks, so the two can never run ``rsync`` against the same
    destination concurrently. Lock contention and a real transfer failure
    are both reported the same way a JobServer poll-cycle failure is
    treated -- worth trying again shortly, not an error to surface to the
    user as broken.
    """
    from seamm_slurm.config import list_sections

    from seamm_webui.queue_config import get_jobserver_name, get_root

    job = _get_job_or_404(job_id)

    queue = (job.parameters or {}).get("queue")
    if not queue:
        return {"synced": False, "reason": "not routed to a queue"}

    root = get_root()
    if root is None:
        return {"synced": False, "reason": "no queue config"}

    sections = list_sections(root, get_jobserver_name())
    section = sections.get(queue)
    if section is None or section.type != "slurm" or section.transport != "ssh":
        return {"synced": False, "reason": "not a remote queue"}

    now = time.monotonic()
    last = _last_synced.get(job_id)
    if last is not None and now - last < SYNC_MIN_INTERVAL:
        return {"synced": False, "reason": "throttled"}

    lock = fasteners.InterProcessLock(str(Path(job.path) / STAGE_LOCK_FILENAME))
    if not lock.acquire(blocking=True, timeout=5):
        return {"synced": False, "reason": "locked"}

    # Counts as an attempt whether it succeeds or fails below -- a failed
    # transfer still did real ssh/rsync work, so it should be throttled
    # the same as a successful one rather than retried on every request.
    _last_synced[job_id] = now
    try:
        remote_wdir = section.remote_wdir_for(job.path)
        section.build_stager().stage_out(remote_wdir, job.path)
    except StageError as e:
        return {"synced": False, "reason": f"transfer failed: {e}"}
    finally:
        lock.release()

    return {"synced": True}


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


def _resolve_upload_target(job, filename: str) -> Path:
    """Resolve where an uploaded file should be written under the job's
    directory. Strips a leading "job:" prefix -- seamm_dashboard_client's
    safe_filename() always adds one (e.g. "job:data/foo.xyz"; see
    Dashboard.submit()/put_file() there) -- and guards against traversal
    outside the job directory the same way _resolve_job_file guards
    downloads, just for a write target rather than a required-to-exist
    read.
    """
    if filename.startswith("job:"):
        filename = filename[4:]

    base = Path(job.path).resolve()
    target = (base / filename).resolve()

    if not target.is_relative_to(base):
        raise HTTPException(status_code=403, detail="Invalid filename")
    return target


@router.post("/{job_id}/files", status_code=201)
async def upload_job_file(
    job_id: int,
    file: UploadFile = File(...),
    _: None = Depends(require_permission("update")),
):
    """Upload a file into the job's directory -- the counterpart to
    seamm_dashboard_client's Dashboard.submit(), which calls this once per
    external data file a flowchart references (e.g. an initial structure
    file for a --file argument), right after creating the job itself.
    Mirrors the old dashboard's add_file_to_job: strip a leading "job:"
    from the filename, write under the job's directory, creating any
    subdirectory (e.g. "data/") as needed.
    """
    job = _get_job_or_404(job_id, permission="update")
    target = _resolve_upload_target(job, file.filename)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(await file.read())

    return {"path": str(target)}


@router.get("/{job_id}/files/download")
def download_job_file(
    job_id: int, filename: str, _: None = Depends(require_permission("read"))
):
    """Download a single file from the job's directory as an attachment."""
    job = _get_job_or_404(job_id)
    target = _resolve_job_file(job, filename)
    return FileResponse(target, filename=target.name)


@router.get("/{job_id}/files/content")
def get_job_file_content(
    job_id: int, filename: str, _: None = Depends(require_permission("read"))
):
    """Return a file's text content for in-browser viewing (not a download).

    Guards against two things a naive "just read_text() it" would choke on:
    binary files (decoding fails) and files too large to reasonably render in
    a browser tab. Both come back as a normal 200 with ``content: null`` and
    a ``reason``, not an error -- the frontend falls back to offering the
    download link instead of showing an error page.
    """
    job = _get_job_or_404(job_id)
    target = _resolve_job_file(job, filename)

    size = target.stat().st_size
    if size > MAX_PREVIEW_BYTES:
        return {"content": None, "reason": "too_large", "size": size}

    try:
        content = target.read_text()
    except (UnicodeDecodeError, ValueError):
        return {"content": None, "reason": "binary", "size": size}

    return {"content": content, "reason": None, "size": size}
