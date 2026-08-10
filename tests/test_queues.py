"""Tests for GET /api/queues (seamm_jobserver's 2026-08-10 multi-queue
routing campaign, Phase 3: the read side seamm_webui exposes so a
submission client -- the Tk desktop dialog, Phase 4 -- can build a queue
picker).

Writes a real <root>/<jobserver-name>.ini and reads it back through the
route, the same file format/parsing seamm_slurm.config and seamm_jobserver
itself use -- no mocking of seamm_slurm.
"""

from fastapi.testclient import TestClient

from seamm_webui.main import create_app


def test_no_root_configured_returns_empty_list(tmp_path):
    # The default for every pre-existing caller -- root=None -- must keep
    # working exactly as before this endpoint existed.
    app = create_app(str(tmp_path / "datastore"))
    client = TestClient(app)

    response = client.get("/api/queues")
    assert response.status_code == 200
    assert response.json() == []


def test_root_configured_but_no_ini_file_returns_empty_list(tmp_path):
    app = create_app(
        str(tmp_path / "datastore"), root=str(tmp_path), jobserver_name="molssi10"
    )
    client = TestClient(app)

    response = client.get("/api/queues")
    assert response.status_code == 200
    assert response.json() == []


def test_lists_queues_with_limits_and_default(tmp_path):
    (tmp_path / "molssi10.ini").write_text(
        "[DEFAULT]\n"
        "default = molssi10\n"
        "\n"
        "[local]\n"
        "type = local\n"
        "\n"
        "[molssi10]\n"
        "type = slurm\n"
        "transport = local\n"
        "partition = batch\n"
        "\n"
        "[molssi10.limits]\n"
        "overridable = ntasks, partition\n"
        "ntasks.min = 1\n"
        "ntasks.max = 6\n"
        "partition.choices = batch, gpu\n"
    )
    app = create_app(
        str(tmp_path / "datastore"), root=str(tmp_path), jobserver_name="molssi10"
    )
    client = TestClient(app)

    response = client.get("/api/queues")
    assert response.status_code == 200
    queues = {q["name"]: q for q in response.json()}

    assert set(queues) == {"local", "molssi10"}

    assert queues["local"]["type"] == "local"
    assert queues["local"]["default"] is False
    assert queues["local"]["limits"] == {}

    assert queues["molssi10"]["type"] == "slurm"
    assert queues["molssi10"]["default"] is True
    assert queues["molssi10"]["limits"] == {
        "ntasks": {
            "choices": None,
            "minimum": "1",
            "maximum": "6",
            "current": None,  # [molssi10] itself sets no ntasks default
        },
        "partition": {
            "choices": ["batch", "gpu"],
            "minimum": None,
            "maximum": None,
            "current": "batch",
        },
    }


def test_never_leaks_host_or_transport(tmp_path):
    (tmp_path / "mac.ini").write_text(
        "[chemai]\n"
        "type = slurm\n"
        "transport = ssh\n"
        "host = seamm-chemai\n"
        "remote_root = /home/psaxe/scratch\n"
        "remote_conda_env = seamm\n"
    )
    app = create_app(
        str(tmp_path / "datastore"), root=str(tmp_path), jobserver_name="mac"
    )
    client = TestClient(app)

    response = client.get("/api/queues")
    body = response.json()
    assert len(body) == 1
    assert set(body[0]) == {"name", "type", "default", "limits"}


def test_jobserver_name_defaults_to_hostname(tmp_path, monkeypatch):
    import socket

    monkeypatch.setattr(socket, "gethostname", lambda: "test-host")
    (tmp_path / "test-host.ini").write_text("[local]\ntype = local\n")

    app = create_app(str(tmp_path / "datastore"), root=str(tmp_path))
    client = TestClient(app)

    response = client.get("/api/queues")
    assert [q["name"] for q in response.json()] == ["local"]


def test_ambiguous_default_does_not_crash_the_endpoint(tmp_path):
    # No [DEFAULT] default= and more than one section -- load_slurm_config()
    # raises for the JobServer itself (it won't start with an ambiguous
    # config), but this read-only endpoint should still report the queues
    # that exist rather than 500ing over a site misconfiguration.
    (tmp_path / "molssi10.ini").write_text("[a]\ntype = local\n\n[b]\ntype = local\n")
    app = create_app(
        str(tmp_path / "datastore"), root=str(tmp_path), jobserver_name="molssi10"
    )
    client = TestClient(app)

    response = client.get("/api/queues")
    assert response.status_code == 200
    queues = {q["name"]: q for q in response.json()}
    assert set(queues) == {"a", "b"}
    assert queues["a"]["default"] is False
    assert queues["b"]["default"] is False
