"""The job's task view: manifests and parallel-loop iterations, from files."""

import json
import shutil
from pathlib import Path

from fastapi.testclient import TestClient

from seamm_webui.main import create_app
from seamm_webui.tasks_view import job_tasks

HEADER = "!MolSSI job_data 1.0\n"


def manifest(path, tasks):
    path.mkdir(parents=True, exist_ok=True)
    (path / "manifest.json").write_text(json.dumps({"version": 1, "tasks": tasks}))


def make_job(job):
    """A job with an ORCA step's tasks and a parallel loop of three iterations,
    the loop still running: iteration 1 merged, 2 failed, 3 running."""
    manifest(
        job / "2" / "tasks",
        {
            "frag-1": {"state": "finished", "attempts": 1, "backend": "local"},
            "frag-2": {
                "state": "failed",
                "attempts": 2,
                "backend": "queue:tc",
                "id": "123#bundle_0000.1#frag-2",
                "bundle": "bundle_0000",
                "history": [{"reason": "exit code 1"}],
            },
            "frag-3": {"state": "running", "attempts": 1},
        },
    )
    manifest(job / "2" / "tasks" / "_bundles" / "bundle_0000.1", {"x": {}})  # ignored
    loop = job / "4"
    for name, data in (
        ("iter_1", {"state": "finished", "iteration": {"done": True}}),
        ("iter_2", {"state": "error"}),
        ("iter_3", {"state": "started"}),
    ):
        evaluator = loop / name / "_evaluator"
        evaluator.mkdir(parents=True)
        (evaluator / "job_data.json").write_text(HEADER + json.dumps(data))
    # A step inside an iteration has tasks of its own
    manifest(loop / "iter_3" / "1" / "tasks", {"a": {"state": "queued"}})
    (job / "checkpoint.json").write_text(
        json.dumps(
            {
                "position": [
                    {
                        "node": ["4"],
                        "loop": {
                            "parallel": True,
                            "next": 3,
                            "failed": [2],
                            "directories": {
                                "1": "iter_1",
                                "2": "iter_2",
                                "3": "iter_3",
                            },
                        },
                    }
                ]
            }
        )
    )


def test_job_tasks(tmp_path):
    job = tmp_path / "Job_000001"
    make_job(job)
    result = job_tasks(job)
    steps = {s["step"]: s for s in result["steps"]}
    assert set(steps) == {"2", "4/iter_3/1"}
    assert steps["2"]["counts"]["finished"] == 1
    assert steps["2"]["counts"]["failed"] == 1
    failed = [t for t in steps["2"]["tasks"] if t["key"] == "frag-2"][0]
    assert failed["reason"] == "exit code 1" and failed["bundle"] == "bundle_0000"
    (loop,) = result["loops"]
    assert loop["loop"] == "4" and loop["running"]
    rows = {r["name"]: r for r in loop["iterations"]}
    assert rows["iter_1"]["state"] == "finished" and rows["iter_1"]["merged"]
    assert rows["iter_2"]["failed"] and not rows["iter_2"]["merged"]
    assert rows["iter_3"]["state"] == "started" and rows["iter_3"]["merged"] is False
    assert rows["iter_3"]["job_out"] == "iter_3/_evaluator/job.out"


def test_after_the_loop(tmp_path):
    """The loop finished: no frame in the checkpoint, iterations still listed."""
    job = tmp_path / "Job_000001"
    make_job(job)
    (job / "checkpoint.json").write_text(json.dumps({"position": []}))
    (loop,) = job_tasks(job)["loops"]
    assert not loop["running"]
    assert all(r["merged"] is None for r in loop["iterations"])


def test_route(tmp_path):
    app = create_app(str(tmp_path / "datastore"))
    client = TestClient(app)
    import seamm_datastore
    from seamm_datastore.database.models import Job
    from seamm_webui.db import get_datastore

    job_dir = tmp_path / "datastore" / "projects" / "default" / "Job_000001"
    job_dir.mkdir(parents=True)
    sample = Path(seamm_datastore.__file__).parent / "data" / "sample_flowchart_v2.flow"
    shutil.copy(sample, job_dir / "flowchart.flow")
    make_job(job_dir)
    job = Job.create(
        1,
        flowchart_filename=str(job_dir / "flowchart.flow"),
        project_names=["default"],
        path=str(job_dir),
        title="test job",
    )
    ds = get_datastore()
    ds.Session.add(job)
    ds.Session.commit()

    body = client.get("/api/jobs/1/tasks").json()
    assert {s["step"] for s in body["steps"]} == {"2", "4/iter_3/1"}
    assert body["loops"][0]["loop"] == "4"
    # A shallow file listing
    shallow = {f["path"] for f in client.get("/api/jobs/1/files?depth=1").json()}
    assert shallow == {"flowchart.flow", "checkpoint.json"}
    assert client.get("/api/jobs/2/tasks").status_code == 404
