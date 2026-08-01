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


def test_job_project_filter(tmp_path):
    app = create_app(str(tmp_path / "datastore"))
    client = TestClient(app)

    import seamm_datastore
    from seamm_datastore.database.models import Job, Project
    from seamm_webui.db import get_datastore

    ds = get_datastore()
    other = Project.create(name="other", path=str(tmp_path / "datastore" / "projects" / "other"))
    ds.Session.add(other)
    ds.Session.commit()

    sample = Path(seamm_datastore.__file__).parent / "data" / "sample_flowchart_v2.flow"

    def make_job(job_id, project_name):
        job_dir = (
            tmp_path / "datastore" / "projects" / project_name / f"Job_{job_id:06d}"
        )
        job_dir.mkdir(parents=True)
        shutil.copy(sample, job_dir / "flowchart.flow")
        job = Job.create(
            job_id,
            flowchart_filename=str(job_dir / "flowchart.flow"),
            project_names=[project_name],
            path=str(job_dir),
            title=f"job {job_id} in {project_name}",
        )
        ds.Session.add(job)
        ds.Session.commit()

    make_job(1, "default")
    make_job(2, "default")
    make_job(3, "other")

    # No filter: all three jobs.
    response = client.get("/api/jobs")
    assert {j["id"] for j in response.json()} == {1, 2, 3}

    # Filtered to "other": only job 3.
    response = client.get("/api/jobs", params={"project": "other"})
    assert [j["id"] for j in response.json()] == [3]

    # Filtered to "default": jobs 1 and 2, and pagination applies within
    # the filtered set, not the unfiltered one.
    response = client.get("/api/jobs", params={"project": "default", "limit": 1})
    assert [j["id"] for j in response.json()] == [1]

    response = client.get(
        "/api/jobs", params={"project": "default", "limit": 1, "offset": 1}
    )
    assert [j["id"] for j in response.json()] == [2]

    # A nonexistent project just yields an empty list, not an error.
    response = client.get("/api/jobs", params={"project": "no-such-project"})
    assert response.status_code == 200
    assert response.json() == []


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


def test_job_file_content(tmp_path, monkeypatch):
    app = create_app(str(tmp_path / "datastore"))
    client = TestClient(app)

    import seamm_datastore
    from seamm_datastore.database.models import Job
    from seamm_webui.db import get_datastore

    job_dir = tmp_path / "datastore" / "projects" / "default" / "Job_000001"
    job_dir.mkdir(parents=True)
    sample = Path(seamm_datastore.__file__).parent / "data" / "sample_flowchart_v2.flow"
    shutil.copy(sample, job_dir / "flowchart.flow")
    (job_dir / "output.txt").write_text("line one\nline two\n")
    (job_dir / "binary.dat").write_bytes(b"\xff\xfe\x00\x01\x02")

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

    # Plain text: content comes back inline.
    response = client.get(
        "/api/jobs/1/files/content", params={"filename": "output.txt"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["content"] == "line one\nline two\n"
    assert body["reason"] is None

    # Binary: no content, a reason instead -- not a decoding crash.
    response = client.get(
        "/api/jobs/1/files/content", params={"filename": "binary.dat"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["content"] is None
    assert body["reason"] == "binary"

    # Too large: also no content, a different reason, without reading the
    # whole file into memory (MAX_PREVIEW_BYTES lowered for this test).
    import seamm_webui.routers.jobs as jobs_module

    monkeypatch.setattr(jobs_module, "MAX_PREVIEW_BYTES", 5)
    response = client.get(
        "/api/jobs/1/files/content", params={"filename": "output.txt"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["content"] is None
    assert body["reason"] == "too_large"
    assert body["size"] == len("line one\nline two\n")

    # Traversal must be rejected here too.
    response = client.get(
        "/api/jobs/1/files/content",
        params={"filename": "../../../../etc/passwd"},
    )
    assert response.status_code == 403


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
