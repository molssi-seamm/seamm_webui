"""Tests for POST /api/jobs/{id}/sync -- pulling a still-running
transport=ssh job's remote files back on demand, reusing seamm_slurm.stage
the same way seamm_jobserver does at job-terminal time, but independently
(this Dashboard reads the same <root>/<jobserver-name>.ini itself).

Uses a real <root>/<jobserver-name>.ini and real seamm_slurm.config parsing
-- no mocking of seamm_slurm itself -- but mocks subprocess.run inside
seamm_slurm.stage so no real ssh/rsync ever runs, the same way
seamm_slurm's own test_stage.py does.
"""

import shutil
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import seamm_webui.routers.jobs as jobs_router
from seamm_webui.main import create_app


@pytest.fixture(autouse=True)
def _clear_sync_throttle_state():
    """The sync-throttle dict is module-level (in-process) state -- tests
    reuse job ids across the file, so it must not leak between tests."""
    jobs_router._last_synced.clear()
    yield
    jobs_router._last_synced.clear()


def _make_app_and_job(tmp_path, *, ini_text=None, jobserver_name="mac", queue=None):
    if ini_text is not None:
        (tmp_path / f"{jobserver_name}.ini").write_text(ini_text)
        app = create_app(
            str(tmp_path / "datastore"),
            root=str(tmp_path),
            jobserver_name=jobserver_name,
        )
    else:
        app = create_app(str(tmp_path / "datastore"))

    client = TestClient(app)

    # seamm_datastore.database.models must not be imported before
    # create_app() (-> init_datastore()) has run -- see db.py's module
    # docstring.
    import seamm_datastore
    from seamm_datastore.database.models import Job
    from seamm_webui.db import get_datastore

    ds = get_datastore()
    sample = Path(seamm_datastore.__file__).parent / "data" / "sample_flowchart_v2.flow"
    job_dir = tmp_path / "datastore" / "projects" / "default" / "Job_000001"
    job_dir.mkdir(parents=True)
    shutil.copy(sample, job_dir / "flowchart.flow")
    job = Job.create(
        1,
        flowchart_filename=str(job_dir / "flowchart.flow"),
        project_names=["default"],
        path=str(job_dir),
        title="Test job",
        status="running",
        parameters={"queue": queue} if queue else {},
    )
    ds.Session.add(job)
    ds.Session.commit()

    return client, job_dir


def test_sync_no_queue_is_a_noop(tmp_path):
    client, job_dir = _make_app_and_job(tmp_path)

    response = client.post("/api/jobs/1/sync")
    assert response.status_code == 200
    assert response.json() == {"synced": False, "reason": "not routed to a queue"}


def test_sync_no_queue_config_is_a_noop(tmp_path):
    # A queue is recorded on the job, but this Dashboard has no root/
    # jobserver_name configured at all -- same as GET /api/queues in that
    # case, treat the feature as absent rather than erroring.
    client, job_dir = _make_app_and_job(tmp_path, queue="cluster")

    response = client.post("/api/jobs/1/sync")
    assert response.status_code == 200
    assert response.json() == {"synced": False, "reason": "no queue config"}


def test_sync_unknown_queue_is_a_noop(tmp_path):
    client, job_dir = _make_app_and_job(
        tmp_path, ini_text="[local]\ntype = local\n", queue="cluster"
    )

    response = client.post("/api/jobs/1/sync")
    assert response.status_code == 200
    assert response.json() == {"synced": False, "reason": "not a remote queue"}


def test_sync_type_local_queue_is_a_noop(tmp_path):
    client, job_dir = _make_app_and_job(
        tmp_path, ini_text="[local]\ntype = local\n", queue="local"
    )

    response = client.post("/api/jobs/1/sync")
    assert response.status_code == 200
    assert response.json() == {"synced": False, "reason": "not a remote queue"}


def test_sync_shared_filesystem_queue_is_a_noop(tmp_path):
    # type=slurm but transport=local -- the JobServer already shares this
    # filesystem, nothing to pull.
    client, job_dir = _make_app_and_job(
        tmp_path,
        ini_text="[shared]\ntype = slurm\ntransport = local\n",
        queue="shared",
    )

    response = client.post("/api/jobs/1/sync")
    assert response.status_code == 200
    assert response.json() == {"synced": False, "reason": "not a remote queue"}


_SSH_INI = (
    "[cluster]\n"
    "type = slurm\n"
    "transport = ssh\n"
    "host = seamm-cluster\n"
    "remote_root = /home/psaxe/scratch\n"
    "remote_conda_env = seamm\n"
)


def test_sync_ssh_queue_calls_stage_out(tmp_path):
    client, job_dir = _make_app_and_job(tmp_path, ini_text=_SSH_INI, queue="cluster")

    fake_proc = MagicMock(returncode=0, stdout="", stderr="")
    with patch("seamm_slurm.stage.subprocess.run", return_value=fake_proc) as run:
        response = client.post("/api/jobs/1/sync")

    assert response.status_code == 200
    assert response.json() == {"synced": True}

    assert run.call_count == 1
    rsync_argv = run.call_args.args[0]
    assert rsync_argv[0] == "rsync"
    # remote_wdir is remote_root/<job dir name>, derived the same way
    # seamm_jobserver's own _remote_wdir()/SlurmSection.remote_wdir_for()
    # computes it.
    assert rsync_argv[-2] == f"seamm-cluster:/home/psaxe/scratch/{job_dir.name}/"
    assert rsync_argv[-1] == f"{job_dir}/"


def test_sync_throttled_on_second_call(tmp_path):
    client, job_dir = _make_app_and_job(tmp_path, ini_text=_SSH_INI, queue="cluster")

    fake_proc = MagicMock(returncode=0, stdout="", stderr="")
    with patch("seamm_slurm.stage.subprocess.run", return_value=fake_proc) as run:
        first = client.post("/api/jobs/1/sync")
        second = client.post("/api/jobs/1/sync")

    assert first.json() == {"synced": True}
    assert second.json() == {"synced": False, "reason": "throttled"}
    # Only the first call actually did any work.
    assert run.call_count == 1


def test_sync_lock_contention_returns_locked_not_error(tmp_path):
    client, job_dir = _make_app_and_job(tmp_path, ini_text=_SSH_INI, queue="cluster")

    fake_lock = MagicMock()
    fake_lock.acquire.return_value = False
    with (
        patch(
            "seamm_webui.routers.jobs.fasteners.InterProcessLock",
            return_value=fake_lock,
        ),
        patch("seamm_slurm.stage.subprocess.run") as run,
    ):
        response = client.post("/api/jobs/1/sync")

    assert response.status_code == 200
    assert response.json() == {"synced": False, "reason": "locked"}
    run.assert_not_called()


def test_sync_transfer_failure_reported_not_raised_and_still_throttles(tmp_path):
    client, job_dir = _make_app_and_job(tmp_path, ini_text=_SSH_INI, queue="cluster")

    fake_proc = MagicMock(returncode=1, stdout="", stderr="ssh: connection refused")
    with patch("seamm_slurm.stage.subprocess.run", return_value=fake_proc) as run:
        first = client.post("/api/jobs/1/sync")
        second = client.post("/api/jobs/1/sync")

    assert first.status_code == 200
    body = first.json()
    assert body["synced"] is False
    assert "transfer failed" in body["reason"]

    # A failed attempt still counts as an attempt -- don't hammer a broken
    # remote host on every request.
    assert second.json() == {"synced": False, "reason": "throttled"}
    assert run.call_count == 1
