"""Each request's database session is closed when the request ends.

seamm_datastore's sessions are per thread, and FastAPI runs sync routes in a pool
of up to 40 threads, so without closing them every thread that had touched the
datastore kept a connection checked out of SQLAlchemy's pool (5 + 10): after
enough concurrent requests every request waited 30 s and failed with "QueuePool
limit of size 5 overflow 10 reached" (ChemAI, 2026-10-23, job 5368's page polled
by a browser)."""

from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from seamm_webui.db import get_datastore
from seamm_webui.main import create_app


def test_requests_return_their_connections(tmp_path):
    app = create_app(str(tmp_path / "datastore"))
    client = TestClient(app)
    pool = get_datastore().engine.pool

    def get(path):
        return client.get(path).status_code

    paths = ["/api/status", "/api/jobs", "/api/projects", "/api/queues"] * 30
    with ThreadPoolExecutor(max_workers=40) as executor:
        codes = list(executor.map(get, paths))
    assert set(codes) <= {200, 401}, codes
    assert 200 in codes
    assert pool.checkedout() == 0
