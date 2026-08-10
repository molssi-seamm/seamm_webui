"""FastAPI application factory and CLI entry point for seamm_webui."""

import argparse
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from seamm_webui.db import init_datastore, get_datastore_dir

# Hosts that mean "this machine only" -- see run()'s --auth guardrail.
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}

# Populated by `npm run build` (see frontend/vite.config.ts's build.outDir)
# and shipped as package data in released wheels. Absent in an editable/
# source dev install that hasn't built the frontend -- create_app() falls
# back to API-only in that case rather than erroring.
STATIC_DIR = Path(__file__).parent / "static"


def create_app(
    datastore_dir: str, port: int = 8010, auth_mode: str = "none"
) -> FastAPI:
    # Must happen before importing routers -- see the ordering note in
    # seamm_webui/db.py.
    init_datastore(datastore_dir)

    from seamm_webui.auth import init_auth
    from seamm_webui.routers import auth, jobs, projects
    from seamm_webui.util import get_or_create_secret_key

    # Cookie name is scoped to the port (not just a fixed string) so two
    # seamm-webui instances reachable as the same host -- a local one plus
    # an SSH-tunneled cluster one on `localhost`, say -- can never collide:
    # browser cookies are scoped by domain only, not port, so without this
    # logging into one would silently overwrite the other's session
    # cookie. See auth.py's module docstring for the full story.
    secret_key = get_or_create_secret_key(get_datastore_dir())
    init_auth(auth_mode, secret_key, cookie_name=f"seamm_webui_session_{port}")

    app = FastAPI(title="seamm_webui")

    # Dev-friendly CORS: the Vite dev server runs on a different port than
    # the API during development. allow_credentials is required for the
    # session cookie to actually be sent cross-origin in that split-origin
    # dev setup; it's only valid combined with an explicit allow_origins
    # list (browsers reject it with "*", which is also what keeps this
    # safe -- only these known origins can make credentialed requests).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(jobs.router)
    app.include_router(projects.router)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/status")
    def status(request: Request):
        """Liveness/readiness probe for external SEAMM tooling --
        seamm_dashboard_client.Dashboard.status()/submit() call this
        *before* logging in, refusing to submit a job unless it reports
        "status": "running", so this must work unauthenticated (not behind
        require_permission) exactly like /api/health and /api/auth/me.

        Mirrors the shape of the old dashboard's /api/status just enough
        for that client to work, not its full field set. Job counts
        reflect what the caller (if any) can actually see -- a resolved
        identity is set for the duration of this request the same way
        require_permission would, but nothing is required or rejected
        here if there isn't one.
        """
        from seamm_datastore.database.models import Job
        from seamm_webui.auth import get_current_user
        from seamm_webui.db import set_current_user

        username = get_current_user(request)
        set_current_user(username)

        jobs = Job.permissions_query("read")
        return {
            "status": "running",
            "username": username,
            "jobs": {
                "total": jobs.count(),
                "running": jobs.filter_by(status="running").count(),
                "finished": jobs.filter_by(status="finished").count(),
                "submitted": jobs.filter_by(status="submitted").count(),
            },
        }

    if (STATIC_DIR / "index.html").is_file():
        # Registered last -- it's a catch-all, so /api/... routes above
        # must already be in place or this would shadow them.
        assets_dir = STATIC_DIR / "assets"
        if assets_dir.is_dir():
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa_fallback(full_path: str):
            # Client-side routes (e.g. /jobs/123) have no file on disk --
            # serve index.html for those so a hard refresh doesn't 404, but
            # let a genuinely missing /api/... route 404 normally rather
            # than silently returning the SPA shell.
            if full_path.startswith("api/"):
                raise HTTPException(status_code=404)
            candidate = STATIC_DIR / full_path
            if full_path and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(STATIC_DIR / "index.html")

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
    parser.add_argument(
        "--auth",
        choices=["auto", "none", "local"],
        default="auto",
        help=(
            "Authentication mode. 'auto' (default) picks 'none' when --host "
            "is loopback (single-user/local use, no login screen) and "
            "'local' otherwise (real per-user login, required once this is "
            "reachable beyond this machine). 'none' cannot be combined with "
            "a non-loopback --host."
        ),
    )
    parser.add_argument(
        "--ssl-certfile",
        default=None,
        help=(
            "Path to a TLS certificate. If omitted and --host is "
            "non-loopback, a self-signed certificate is generated (once) "
            "and reused under --root -- see --ssl-keyfile."
        ),
    )
    parser.add_argument(
        "--ssl-keyfile",
        default=None,
        help="Path to the private key matching --ssl-certfile.",
    )
    args = parser.parse_args()

    if (args.ssl_certfile is None) != (args.ssl_keyfile is None):
        parser.error("--ssl-certfile and --ssl-keyfile must be given together")

    auth_mode = args.auth
    if auth_mode == "auto":
        auth_mode = "none" if args.host in LOOPBACK_HOSTS else "local"
    elif auth_mode == "none" and args.host not in LOOPBACK_HOSTS:
        parser.error(
            f"--auth none is only allowed when --host is loopback (one of "
            f"{sorted(LOOPBACK_HOSTS)}); got --host {args.host!r}. Use "
            "--auth local, or bind to a loopback host."
        )

    datastore_dir = args.datastore
    if datastore_dir is None:
        datastore_dir = str(Path(args.root).expanduser() / "Jobs")

    ssl_certfile = args.ssl_certfile
    ssl_keyfile = args.ssl_keyfile
    if ssl_certfile is None and ssl_keyfile is None and args.host not in LOOPBACK_HOSTS:
        from seamm_webui.tls import get_or_create_self_signed_cert

        ssl_certfile, ssl_keyfile = get_or_create_self_signed_cert(args.root)
        print(
            f"No --ssl-certfile/--ssl-keyfile given; using a self-signed "
            f"certificate at {ssl_certfile}. Browsers will warn about this "
            "until it's trusted or replaced with a real certificate.",
            flush=True,
        )

    import uvicorn

    app = create_app(datastore_dir, port=args.port, auth_mode=auth_mode)
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        ssl_certfile=ssl_certfile,
        ssl_keyfile=ssl_keyfile,
    )


if __name__ == "__main__":
    run()
