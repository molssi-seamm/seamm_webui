"""Phase 3 auth tests: "none" mode preserves Phase 1/2 behavior, "local"
mode requires real login, and the per-instance cookie-name scoping that
fixes the old dashboard's multi-instance-logs-you-out bug.
"""

from fastapi.testclient import TestClient

from seamm_webui.main import create_app


def test_none_mode_preserves_today_behavior(tmp_path):
    app = create_app(str(tmp_path / "datastore"), auth_mode="none")
    client = TestClient(app)

    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json() == {"auth_mode": "none", "username": None}

    # No login at all -- every route just works, same as Phase 1/2.
    response = client.get("/api/jobs")
    assert response.status_code == 200
    assert response.json() == []


def test_local_mode_requires_login(tmp_path):
    app = create_app(str(tmp_path / "datastore"), auth_mode="local")
    client = TestClient(app)

    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json() == {"auth_mode": "local", "username": None}

    response = client.get("/api/jobs")
    assert response.status_code == 401

    response = client.post("/api/projects", json={"name": "x"})
    assert response.status_code == 401


def test_local_mode_login_logout(tmp_path):
    app = create_app(str(tmp_path / "datastore"), auth_mode="local")
    client = TestClient(app)

    # Wrong password: rejected, no cookie set.
    response = client.post(
        "/api/auth/login", json={"username": "admin", "password": "wrong"}
    )
    assert response.status_code == 401
    assert "seamm_webui_session_8010" not in client.cookies

    # Correct password (the bootstrap admin/admin account every datastore
    # already has): sets the cookie, subsequent requests work.
    response = client.post(
        "/api/auth/login", json={"username": "admin", "password": "admin"}
    )
    assert response.status_code == 200
    assert response.json() == {"username": "admin"}

    response = client.get("/api/auth/me")
    assert response.json() == {"auth_mode": "local", "username": "admin"}

    response = client.get("/api/jobs")
    assert response.status_code == 200

    # Logout clears the cookie; subsequent requests are unauthenticated again.
    response = client.post("/api/auth/logout")
    assert response.status_code == 200
    response = client.get("/api/jobs")
    assert response.status_code == 401


def test_tampered_or_garbage_cookie_is_just_logged_out(tmp_path):
    app = create_app(str(tmp_path / "datastore"), auth_mode="local")
    client = TestClient(app)

    client.cookies.set("seamm_webui_session_8010", "not-a-real-token")
    response = client.get("/api/jobs")
    assert response.status_code == 401  # not a 500

    response = client.get("/api/auth/me")
    assert response.json()["username"] is None


def test_session_cookie_name_is_derived_from_port(tmp_path):
    """Cookie naming is what fixes the old dashboard's "opening a second
    dashboard logs me out of the first" bug (see auth.py's module
    docstring) -- two instances reachable as the same host (e.g. both
    `localhost`, just different ports: a local instance plus an
    SSH-tunneled cluster one) must not share a cookie name.

    Can't prove *non-collision between two live instances* here: like
    seamm_webui.db's `_datastore`, seamm_webui.auth's config is a
    process-wide global (one create_app() per process, matching how
    `seamm-webui` is actually run) -- two create_app() calls in the same
    test process share that global, which isn't the real deployment
    scenario. What's checked here -- the naming formula is deterministic
    and port-derived -- combined with a real two-separate-processes
    Playwright check (see dashboard-rewrite-plan.md's Phase 3 verification)
    is the actual end-to-end proof.
    """
    app = create_app(str(tmp_path / "datastore"), port=9010, auth_mode="local")
    client = TestClient(app)

    client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert "seamm_webui_session_9010" in client.cookies


def test_new_local_account_can_log_in(tmp_path):
    """Exercises the same seamm_datastore.User.create() path
    seamm_webui.manage's CLI script uses."""
    from seamm_datastore.database.models import User
    from seamm_webui.db import get_datastore

    app = create_app(str(tmp_path / "datastore"), auth_mode="local")
    client = TestClient(app)

    ds = get_datastore()
    user = User.create(username="alice", password="secret123", roles=["admin"])
    ds.Session.add(user)
    ds.Session.commit()

    response = client.post(
        "/api/auth/login", json={"username": "alice", "password": "wrong"}
    )
    assert response.status_code == 401

    response = client.post(
        "/api/auth/login", json={"username": "alice", "password": "secret123"}
    )
    assert response.status_code == 200
    assert response.json() == {"username": "alice"}

    response = client.get("/api/jobs")
    assert response.status_code == 200


def test_auth_token_alias(tmp_path):
    """POST /api/auth/token is what seamm_dashboard_client.Dashboard.login()
    actually posts to (the old dashboard's endpoint name) -- must behave
    identically to /api/auth/login, not just exist.
    """
    app = create_app(str(tmp_path / "datastore"), auth_mode="local")
    client = TestClient(app)

    response = client.post(
        "/api/auth/token", json={"username": "admin", "password": "wrong"}
    )
    assert response.status_code == 401

    response = client.post(
        "/api/auth/token", json={"username": "admin", "password": "admin"}
    )
    assert response.status_code == 200
    assert response.json() == {"username": "admin"}

    response = client.get("/api/jobs")
    assert response.status_code == 200
