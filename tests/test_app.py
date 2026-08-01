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
