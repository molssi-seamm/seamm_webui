import shutil
from pathlib import Path

from fastapi.testclient import TestClient

from seamm_webui.main import create_app


def test_health_and_listing(tmp_path):
    app = create_app(str(tmp_path / "datastore"))
    client = TestClient(app)

    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    # Defaults to the hostname (via --jobserver-name's own default) when no
    # explicit --name is given -- just assert it's a non-empty string here
    # rather than hardcoding a machine-specific hostname.
    assert body["name"]

    response = client.get("/api/jobs")
    assert response.status_code == 200
    assert response.json() == []

    response = client.get("/api/projects")
    assert response.status_code == 200
    names = [p["name"] for p in response.json()]
    assert "default" in names


def test_health_name_override_and_default(tmp_path):
    # Explicit --name wins outright.
    app = create_app(
        str(tmp_path / "ds1"), jobserver_name="molssi10", name="MolSSI10 Prod"
    )
    client = TestClient(app)
    assert client.get("/api/health").json()["name"] == "MolSSI10 Prod"

    # No --name given: falls back to --jobserver-name, not the hostname.
    app = create_app(str(tmp_path / "ds2"), jobserver_name="molssi10")
    client = TestClient(app)
    assert client.get("/api/health").json()["name"] == "molssi10"


def test_job_project_filter(tmp_path):
    app = create_app(str(tmp_path / "datastore"))
    client = TestClient(app)

    import seamm_datastore
    from seamm_datastore.database.models import Job, Project
    from seamm_webui.db import get_datastore

    ds = get_datastore()
    other = Project.create(
        name="other", path=str(tmp_path / "datastore" / "projects" / "other")
    )
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

    # X-Total-Count reflects the *filtered* total, before offset/limit --
    # what JobsPage's First/Last buttons need to compute the last page,
    # kept out of the JSON body (routers/jobs.py's list_jobs docstring)
    # so the body stays a plain array for every other caller.
    response = client.get("/api/jobs")
    assert response.headers["x-total-count"] == "3"

    response = client.get("/api/jobs", params={"project": "default", "limit": 1})
    assert response.headers["x-total-count"] == "2"
    assert len(response.json()) == 1

    response = client.get("/api/jobs", params={"project": "no-such-project"})
    assert response.headers["x-total-count"] == "0"


def test_job_status_title_queue_filters(tmp_path):
    app = create_app(str(tmp_path / "datastore"))
    client = TestClient(app)

    import seamm_datastore
    from seamm_datastore.database.models import Job
    from seamm_webui.db import get_datastore

    ds = get_datastore()
    sample = Path(seamm_datastore.__file__).parent / "data" / "sample_flowchart_v2.flow"

    def make_job(job_id, title, status, queue=None):
        job_dir = tmp_path / "datastore" / "projects" / "default" / f"Job_{job_id:06d}"
        job_dir.mkdir(parents=True)
        shutil.copy(sample, job_dir / "flowchart.flow")
        job = Job.create(
            job_id,
            flowchart_filename=str(job_dir / "flowchart.flow"),
            project_names=["default"],
            path=str(job_dir),
            title=title,
            status=status,
            parameters={"queue": queue} if queue else {},
        )
        ds.Session.add(job)
        ds.Session.commit()

    make_job(1, "Water dimer scan", "running", queue="molssi10")
    make_job(2, "Water trimer scan", "finished", queue="molssi10")
    make_job(3, "NaCl optimization", "finished", queue="local")
    make_job(4, "Errored job", "error")

    # Status: exact match.
    response = client.get("/api/jobs", params={"status": "finished"})
    assert {j["id"] for j in response.json()} == {2, 3}

    # Title: case-sensitive-in-SQL substring, but exercised with a matching
    # case here -- the point is "contains", not "equals".
    response = client.get("/api/jobs", params={"title": "scan"})
    assert {j["id"] for j in response.json()} == {1, 2}

    # Queue: exact match against the JSON parameters field; jobs with no
    # queue at all (job 4) never match.
    response = client.get("/api/jobs", params={"queue": "molssi10"})
    assert {j["id"] for j in response.json()} == {1, 2}

    response = client.get("/api/jobs", params={"queue": "local"})
    assert [j["id"] for j in response.json()] == [3]

    # Filters compose (AND, not OR).
    response = client.get(
        "/api/jobs", params={"status": "finished", "queue": "molssi10"}
    )
    assert [j["id"] for j in response.json()] == [2]

    # No match is a clean empty list.
    response = client.get("/api/jobs", params={"status": "killed"})
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

    response = client.get(
        "/api/jobs/1/files/download", params={"filename": "output.txt"}
    )
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
    assert response.status_code == 201
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


def test_project_crud(tmp_path):
    app = create_app(str(tmp_path / "datastore"))
    client = TestClient(app)

    # Create.
    response = client.post(
        "/api/projects", json={"name": "widgets", "description": "Widget jobs"}
    )
    assert response.status_code == 201
    project = response.json()
    project_id = project["id"]
    assert project["name"] == "widgets"
    assert project["description"] == "Widget jobs"
    project_dir = tmp_path / "datastore" / "projects" / "widgets"
    assert project_dir.is_dir()

    # Duplicate name -> clean 400, not a 500.
    response = client.post("/api/projects", json={"name": "widgets"})
    assert response.status_code == 400

    # Get.
    response = client.get(f"/api/projects/{project_id}")
    assert response.status_code == 200
    assert response.json()["description"] == "Widget jobs"

    # Update.
    response = client.patch(
        f"/api/projects/{project_id}", json={"description": "Updated description"}
    )
    assert response.status_code == 200
    assert response.json()["description"] == "Updated description"
    assert response.json()["name"] == "widgets"

    # Renaming to an already-existing name -> clean 400, not a 500.
    other = client.post("/api/projects", json={"name": "gadgets"}).json()
    response = client.patch(f"/api/projects/{project_id}", json={"name": "gadgets"})
    assert response.status_code == 400
    # And the original project is untouched (still named "widgets").
    assert client.get(f"/api/projects/{project_id}").json()["name"] == "widgets"

    # 404s for a nonexistent project.
    response = client.get("/api/projects/999")
    assert response.status_code == 404
    response = client.patch("/api/projects/999", json={"description": "x"})
    assert response.status_code == 404
    response = client.delete("/api/projects/999")
    assert response.status_code == 404

    # Put a real, still-"submitted" job in "widgets" before deleting it.
    import seamm_datastore
    from seamm_datastore.database.models import Job
    from seamm_webui.db import get_datastore

    job_dir = project_dir / "Job_000001"
    job_dir.mkdir(parents=True)
    sample = Path(seamm_datastore.__file__).parent / "data" / "sample_flowchart_v2.flow"
    shutil.copy(sample, job_dir / "flowchart.flow")
    job = Job.create(
        1,
        flowchart_filename=str(job_dir / "flowchart.flow"),
        project_names=["widgets"],
        path=str(job_dir),
        title="still running",
    )
    assert job.status == "submitted"
    ds = get_datastore()
    ds.Session.add(job)
    ds.Session.commit()

    # Delete: removes the DB row and the directory (all job files), and
    # reports the job that was still active when it happened.
    response = client.delete(f"/api/projects/{project_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["deleted"] is True
    assert body["active_jobs"] == [
        {"id": 1, "title": "still running", "status": "submitted"}
    ]
    assert not project_dir.exists()

    response = client.get(f"/api/projects/{project_id}")
    assert response.status_code == 404

    # The job's own row is untouched by deleting its project -- deleting a
    # Project only clears the job_project association, so it's the
    # explicit status="kill" below (not the row vanishing) that actually
    # gets seamm_jobserver to stop it.
    killed_job = Job.query.filter(Job.id == 1).one_or_none()
    assert killed_job is not None
    assert killed_job.status == "kill"

    # "gadgets" (created above, no jobs) deletes cleanly with no active jobs.
    response = client.delete(f"/api/projects/{other['id']}")
    assert response.status_code == 200
    assert response.json()["active_jobs"] == []


def test_kill_job(tmp_path):
    app = create_app(str(tmp_path / "datastore"))
    client = TestClient(app)

    import seamm_datastore
    from seamm_datastore.database.models import Job
    from seamm_webui.db import get_datastore

    job_dir = tmp_path / "datastore" / "projects" / "default" / "Job_000001"
    job_dir.mkdir(parents=True)
    sample = Path(seamm_datastore.__file__).parent / "data" / "sample_flowchart_v2.flow"
    shutil.copy(sample, job_dir / "flowchart.flow")
    job = Job.create(
        1,
        flowchart_filename=str(job_dir / "flowchart.flow"),
        project_names=["default"],
        path=str(job_dir),
        title="a job",
    )
    ds = get_datastore()
    ds.Session.add(job)
    ds.Session.commit()
    assert job.status == "submitted"

    # Killing a submitted job asks for it (status -> "kill"); files are
    # untouched -- this is only a request, seamm_jobserver does the actual
    # stopping and flips status to "killed" itself, out of band.
    response = client.post("/api/jobs/1/kill")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "kill"
    assert (job_dir / "flowchart.flow").exists()

    # Already-"kill" is not itself killable again.
    response = client.post("/api/jobs/1/kill")
    assert response.status_code == 400

    # A finished job can't be killed either.
    Job.update(1, status="finished")
    ds.Session.commit()
    response = client.post("/api/jobs/1/kill")
    assert response.status_code == 400

    # A nonexistent job is a clean 404.
    response = client.post("/api/jobs/999/kill")
    assert response.status_code == 404


def test_delete_job(tmp_path):
    app = create_app(str(tmp_path / "datastore"))
    client = TestClient(app)

    import seamm_datastore
    from seamm_datastore.database.models import Job
    from seamm_webui.db import get_datastore

    job_dir = tmp_path / "datastore" / "projects" / "default" / "Job_000001"
    job_dir.mkdir(parents=True)
    sample = Path(seamm_datastore.__file__).parent / "data" / "sample_flowchart_v2.flow"
    shutil.copy(sample, job_dir / "flowchart.flow")
    job = Job.create(
        1,
        flowchart_filename=str(job_dir / "flowchart.flow"),
        project_names=["default"],
        path=str(job_dir),
        title="a job",
        status="running",
    )
    ds = get_datastore()
    ds.Session.add(job)
    ds.Session.commit()

    # Deleting a job (even a running one -- no status restriction, same as
    # the old dashboard) removes both the row and its files.
    response = client.delete("/api/jobs/1")
    assert response.status_code == 200
    assert response.json() == {"deleted": True}
    assert not job_dir.exists()

    response = client.get("/api/jobs/1")
    assert response.status_code == 404
    assert Job.query.filter(Job.id == 1).one_or_none() is None

    # A nonexistent job is a clean 404, not a 500.
    response = client.delete("/api/jobs/999")
    assert response.status_code == 404


def test_bulk_kill_and_delete_jobs(tmp_path):
    app = create_app(str(tmp_path / "datastore"))
    client = TestClient(app)

    import seamm_datastore
    from seamm_datastore.database.models import Job
    from seamm_webui.db import get_datastore

    sample = Path(seamm_datastore.__file__).parent / "data" / "sample_flowchart_v2.flow"
    ds = get_datastore()

    def make_job(job_id, status):
        job_dir = tmp_path / "datastore" / "projects" / "default" / f"Job_{job_id:06d}"
        job_dir.mkdir(parents=True)
        shutil.copy(sample, job_dir / "flowchart.flow")
        job = Job.create(
            job_id,
            flowchart_filename=str(job_dir / "flowchart.flow"),
            project_names=["default"],
            path=str(job_dir),
            title=f"job {job_id}",
            status=status,
        )
        ds.Session.add(job)
        ds.Session.commit()
        return job_dir

    make_job(1, "submitted")
    make_job(2, "running")
    make_job(3, "finished")

    # Bulk kill: submitted/running jobs are killed, the finished one is
    # silently skipped (not an error), and a nonexistent id is reported
    # separately from "skipped".
    response = client.post("/api/jobs/kill", json={"ids": [1, 2, 3, 999]})
    assert response.status_code == 200
    body = response.json()
    assert sorted(body["killed"]) == [1, 2]
    assert body["skipped"] == [3]
    assert body["not_found"] == [999]

    assert Job.query.filter(Job.id == 1).one().status == "kill"
    assert Job.query.filter(Job.id == 2).one().status == "kill"
    assert Job.query.filter(Job.id == 3).one().status == "finished"

    # Bulk delete: existing jobs are removed (row + files), the
    # nonexistent id is reported, nothing errors.
    response = client.post("/api/jobs/delete", json={"ids": [1, 3, 999]})
    assert response.status_code == 200
    body = response.json()
    assert sorted(body["deleted"]) == [1, 3]
    assert body["not_found"] == [999]

    assert Job.query.filter(Job.id == 1).one_or_none() is None
    assert Job.query.filter(Job.id == 3).one_or_none() is None
    assert not (tmp_path / "datastore" / "projects" / "default" / "Job_000001").exists()
    assert not (tmp_path / "datastore" / "projects" / "default" / "Job_000003").exists()

    # Job 2 was only killed, not deleted -- its row and files remain.
    assert Job.query.filter(Job.id == 2).one().status == "kill"
    assert (tmp_path / "datastore" / "projects" / "default" / "Job_000002").exists()


def test_status_endpoint(tmp_path):
    """seamm_dashboard_client.Dashboard.status()/submit() call this before
    doing anything else, and refuse to submit unless it reports
    status == "running" -- see dashboard.py's status()/submit().
    """
    app = create_app(str(tmp_path / "datastore"))
    client = TestClient(app)

    response = client.get("/api/status")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "running"
    assert body["jobs"] == {"total": 0, "running": 0, "finished": 0, "submitted": 0}


def test_upload_job_file(tmp_path):
    """Counterpart to Dashboard.submit()'s file-transfer step
    (put_file() -> POST /api/jobs/{id}/files, multipart, field "file"),
    called once per external data file a flowchart references, right
    after the job itself is created.
    """
    import seamm_datastore
    from seamm_datastore.database.models import Job
    from seamm_webui.db import get_datastore

    app = create_app(str(tmp_path / "datastore"))
    client = TestClient(app)

    job_dir = tmp_path / "datastore" / "projects" / "default" / "Job_000001"
    job_dir.mkdir(parents=True)
    sample = Path(seamm_datastore.__file__).parent / "data" / "sample_flowchart_v2.flow"
    shutil.copy(sample, job_dir / "flowchart.flow")
    job = Job.create(
        1,
        flowchart_filename=str(job_dir / "flowchart.flow"),
        project_names=["default"],
        path=str(job_dir),
        title="upload test",
    )
    ds = get_datastore()
    ds.Session.add(job)
    ds.Session.commit()

    # seamm_dashboard_client.safe_filename() always produces a "job:"
    # prefixed name, e.g. "job:data/structure.xyz" -- the server strips it.
    response = client.post(
        "/api/jobs/1/files",
        files={"file": ("job:data/structure.xyz", b"18\n\ncomment\n", "text/plain")},
    )
    assert response.status_code == 201
    assert response.json() == {"path": str(job_dir / "data" / "structure.xyz")}
    assert (job_dir / "data" / "structure.xyz").read_bytes() == b"18\n\ncomment\n"

    # Path traversal must be rejected here too, same as downloads.
    response = client.post(
        "/api/jobs/1/files",
        files={"file": ("job:../../../../etc/passwd", b"nope", "text/plain")},
    )
    assert response.status_code == 403

    # A nonexistent job is a clean 404.
    response = client.post(
        "/api/jobs/999/files",
        files={"file": ("job:data/x.txt", b"x", "text/plain")},
    )
    assert response.status_code == 404


def test_static_spa_fallback_and_traversal(tmp_path, monkeypatch):
    """The SPA-fallback route (registered only when a built frontend is
    present -- see create_app()) must serve real static files, fall back to
    index.html for client-side routes, and never let a crafted full_path
    (e.g. "../../../etc/passwd") escape STATIC_DIR -- the
    CodeQL py/path-injection finding this guards against.
    """
    import seamm_webui.main as main

    static_dir = tmp_path / "static"
    (static_dir / "assets").mkdir(parents=True)
    (static_dir / "index.html").write_text("<html>shell</html>")
    (static_dir / "assets" / "index-abc123.js").write_text("console.log(1)")
    secret = tmp_path / "secret.txt"
    secret.write_text("do not serve me")

    monkeypatch.setattr(main, "STATIC_DIR", static_dir.resolve())

    app = main.create_app(str(tmp_path / "datastore"))
    client = TestClient(app)

    # A real asset is served as itself, not the SPA shell.
    response = client.get("/assets/index-abc123.js")
    assert response.status_code == 200
    assert "console.log" in response.text

    # An unknown client-side route falls back to the SPA shell.
    response = client.get("/jobs/123")
    assert response.status_code == 200
    assert "shell" in response.text

    # /api/... still 404s normally rather than returning the SPA shell.
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404

    # Traversal attempts must not escape STATIC_DIR -- they fall back to
    # the SPA shell (like any other unmatched path), never the real file.
    for path in (
        "/../secret.txt",
        "/assets/../../secret.txt",
        "/..%2f..%2fsecret.txt",
    ):
        response = client.get(path)
        assert response.status_code == 200
        assert "do not serve me" not in response.text
        assert "shell" in response.text
