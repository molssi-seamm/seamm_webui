"""Admin user-management endpoints (routers/admin.py) -- the web equivalent
of manage.py's seamm-webui-user CLI, gated by the admin role rather than
just being logged in (see auth.require_admin).
"""

from fastapi.testclient import TestClient

from seamm_webui.main import create_app


def _login_admin(client):
    response = client.post(
        "/api/auth/login", json={"username": "admin", "password": "admin"}
    )
    assert response.status_code == 200


def test_requires_login(tmp_path):
    app = create_app(str(tmp_path / "datastore"), auth_mode="local")
    client = TestClient(app)

    assert client.get("/api/admin/users").status_code == 401


def test_non_admin_role_is_forbidden(tmp_path):
    from seamm_datastore.database.models import User
    from seamm_webui.db import get_datastore

    app = create_app(str(tmp_path / "datastore"), auth_mode="local")
    client = TestClient(app)

    ds = get_datastore()
    user = User.create(username="bob", password="secret123", roles=["user"])
    ds.Session.add(user)
    ds.Session.commit()

    client.post("/api/auth/login", json={"username": "bob", "password": "secret123"})
    response = client.get("/api/admin/users")
    assert response.status_code == 403


def test_none_mode_fixed_identity_is_admin(tmp_path):
    # The fixed "none"-mode identity has the admin role in every datastore
    # (seamm_datastore's bootstrap admin/admin account) -- admin routes work
    # there too, even though the frontend never shows the nav entry for it.
    app = create_app(str(tmp_path / "datastore"), auth_mode="none")
    client = TestClient(app)

    assert client.get("/api/admin/users").status_code == 200


def test_list_create_set_password_delete(tmp_path):
    app = create_app(str(tmp_path / "datastore"), auth_mode="local")
    client = TestClient(app)
    _login_admin(client)

    # The bootstrap admin account (and, on a real machine, also one named
    # after the OS user running seamm_datastore's build.py -- don't assume
    # an exact roster) already exists.
    response = client.get("/api/admin/users")
    assert response.status_code == 200
    before = {u["username"] for u in response.json()}
    assert "admin" in before

    # Create a new account.
    response = client.post(
        "/api/admin/users",
        json={"username": "alice", "password": "secret123", "email": "a@example.com"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "alice"
    assert body["email"] == "a@example.com"
    assert body["roles"] == ["admin"]

    response = client.get("/api/admin/users")
    after = {u["username"] for u in response.json()}
    assert after == before | {"alice"}

    # The new account can actually log in.
    other = TestClient(app)
    response = other.post(
        "/api/auth/login", json={"username": "alice", "password": "secret123"}
    )
    assert response.status_code == 200

    # Duplicate username is a clean 400, not a 500.
    response = client.post(
        "/api/admin/users", json={"username": "alice", "password": "x"}
    )
    assert response.status_code == 400

    # Admin resets alice's password.
    response = client.post(
        "/api/admin/users/alice/set-password", json={"password": "newpass456"}
    )
    assert response.status_code == 200

    response = other.post(
        "/api/auth/login", json={"username": "alice", "password": "secret123"}
    )
    assert response.status_code == 401
    response = other.post(
        "/api/auth/login", json={"username": "alice", "password": "newpass456"}
    )
    assert response.status_code == 200

    # Delete alice.
    response = client.delete("/api/admin/users/alice")
    assert response.status_code == 204

    response = other.post(
        "/api/auth/login", json={"username": "alice", "password": "newpass456"}
    )
    assert response.status_code == 401


def test_set_password_and_delete_unknown_user_is_404(tmp_path):
    app = create_app(str(tmp_path / "datastore"), auth_mode="local")
    client = TestClient(app)
    _login_admin(client)

    response = client.post(
        "/api/admin/users/nobody/set-password", json={"password": "x"}
    )
    assert response.status_code == 404

    response = client.delete("/api/admin/users/nobody")
    assert response.status_code == 404


def test_cannot_delete_own_account(tmp_path):
    app = create_app(str(tmp_path / "datastore"), auth_mode="local")
    client = TestClient(app)
    _login_admin(client)

    response = client.delete("/api/admin/users/admin")
    assert response.status_code == 400

    # Still there, and still able to log in.
    response = client.post(
        "/api/auth/login", json={"username": "admin", "password": "admin"}
    )
    assert response.status_code == 200


def test_admin_can_delete_another_admin_but_never_themselves(tmp_path):
    """There's no separate "last admin" counter (see delete_user's
    docstring) -- the self-delete guard alone is what keeps at least one
    admin around, since reaching the delete route at all already required
    being logged in as an admin. Exercise both halves: deleting a *different*
    admin is fine, deleting yourself never is, even when you're the only
    admin left.
    """
    from seamm_datastore.database.models import User
    from seamm_webui.db import get_datastore

    app = create_app(str(tmp_path / "datastore"), auth_mode="local")

    ds = get_datastore()
    user = User.create(username="alice", password="secret123", roles=["admin"])
    ds.Session.add(user)
    ds.Session.commit()

    alice_client = TestClient(app)
    alice_client.post(
        "/api/auth/login", json={"username": "alice", "password": "secret123"}
    )

    # alice deletes the bootstrap admin -- a different admin, allowed.
    response = alice_client.delete("/api/admin/users/admin")
    assert response.status_code == 204

    # alice is now the only admin left; she still can't delete herself.
    response = alice_client.delete("/api/admin/users/alice")
    assert response.status_code == 400

    response = alice_client.post(
        "/api/auth/login", json={"username": "alice", "password": "secret123"}
    )
    assert response.status_code == 200
