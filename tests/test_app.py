import shutil
from pathlib import Path

from fastapi.testclient import TestClient

from seamm_webui.main import create_app


def test_health_and_listing(tmp_path):
    app = create_app(str(tmp_path / "datastore"))
    client = TestClient(app)

    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

    response = client.get("/api/jobs")
    assert response.status_code == 200
    assert response.json() == []

    response = client.get("/api/projects")
    assert response.status_code == 200
    names = [p["name"] for p in response.json()]
    assert "default" in names


def test_job_files_listing_and_download(tmp_path):
    app = create_app(str(tmp_path / "datastore"))
    client = TestClient(app)

    # Create a real job with real files on disk, the same way the old
    # dashboard's add_job route does.
    import seamm_datastore
    from seamm_datastore.database.models import Job
    from seamm_webui.db import get_datastore

    job_dir = tmp_path / "datastore" / "projects" / "default" / "Job_000001"
    job_dir.mkdir(parents=True)
    sample = Path(seamm_datastore.__file__).parent / "data" / "sample_flowchart_v2.flow"
    shutil.copy(sample, job_dir / "flowchart.flow")
    (job_dir / "output.txt").write_text("some output\n")
    (job_dir / "subdir").mkdir()
    (job_dir / "subdir" / "nested.txt").write_text("nested output\n")

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

    response = client.get("/api/jobs/1/files")
    assert response.status_code == 200
    paths = {f["path"] for f in response.json()}
    assert paths == {"flowchart.flow", "output.txt", "subdir/nested.txt"}

    response = client.get("/api/jobs/1/files/download", params={"filename": "output.txt"})
    assert response.status_code == 200
    assert response.text == "some output\n"

    response = client.get(
        "/api/jobs/1/files/download", params={"filename": "subdir/nested.txt"}
    )
    assert response.status_code == 200
    assert response.text == "nested output\n"

    # Path traversal must be rejected, not just blocked by a substring check.
    response = client.get(
        "/api/jobs/1/files/download",
        params={"filename": "../../../../etc/passwd"},
    )
    assert response.status_code == 403

    response = client.get("/api/jobs/999/files")
    assert response.status_code == 404


def test_submit_job(tmp_path):
    app = create_app(str(tmp_path / "datastore"))
    client = TestClient(app)

    import seamm_datastore

    sample = Path(seamm_datastore.__file__).parent / "data" / "sample_flowchart_v2.flow"
    flowchart_text = sample.read_text()

    response = client.post(
        "/api/jobs",
        json={
            "flowchart": flowchart_text,
            "project": "default",
            "title": "my first job",
            "description": "a test submission",
        },
    )
    assert response.status_code == 200
    job = response.json()
    assert job["title"] == "my first job"
    assert job["status"] == "submitted"
    job_id = job["id"]

    # Files were actually written to disk.
    job_dir = tmp_path / "datastore" / "projects" / "default" / f"Job_{job_id:06d}"
    assert (job_dir / "flowchart.flow").read_text() == flowchart_text
    assert (job_dir / "job_data.json").exists()

    # The job.id counter file was created and is now at this job's id.
    job_id_file = tmp_path / "datastore" / "job.id"
    assert job_id_file.exists()

    # It shows up in the listing.
    response = client.get("/api/jobs")
    assert response.status_code == 200
    ids = [j["id"] for j in response.json()]
    assert job_id in ids

    # Submitting to a nonexistent project is a clean 400, not a 500.
    response = client.post(
        "/api/jobs",
        json={
            "flowchart": flowchart_text,
            "project": "no-such-project",
            "title": "should fail",
        },
    )
    assert response.status_code == 400
