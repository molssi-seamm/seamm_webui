"""FastAPI application factory and CLI entry point for seamm_webui."""

import argparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from seamm_webui.db import init_datastore


def create_app(datastore_dir: str) -> FastAPI:
    # Must happen before importing routers -- see the ordering note in
    # seamm_webui/db.py.
    init_datastore(datastore_dir)

    from seamm_webui.routers import jobs, projects

    app = FastAPI(title="seamm_webui")

    # Dev-friendly CORS: the Vite dev server runs on a different port than
    # the API during development. Tighten this once there's a real deployment
    # story (Phase 3+).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(jobs.router)
    app.include_router(projects.router)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    return app


def run():
    parser = argparse.ArgumentParser(description="Run the seamm_webui server.")
    parser.add_argument(
        "--root",
        default="~/SEAMM",
        help=(
            "The general SEAMM config root (holds the per-code .ini files); "
            "NOT the datastore itself (default: ~/SEAMM)"
        ),
    )
    parser.add_argument(
        "--datastore",
        default=None,
        help=(
            "The datastore directory (holds seamm.db + projects/); matches "
            "seamm_util's convention of defaulting to '<root>/Jobs' if not "
            "given explicitly"
        ),
    )
    parser.add_argument(
        "--port", type=int, default=8010, help="Port to listen on (default: 8010)"
    )
    parser.add_argument(
        "--host", default="127.0.0.1", help="Host to bind to (default: 127.0.0.1)"
    )
    args = parser.parse_args()

    datastore_dir = args.datastore
    if datastore_dir is None:
        from pathlib import Path

        datastore_dir = str(Path(args.root).expanduser() / "Jobs")

    import uvicorn

    app = create_app(datastore_dir)
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    run()
