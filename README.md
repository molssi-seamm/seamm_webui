# seamm_webui

A from-scratch, SPA-based dashboard for SEAMM — built to run **alongside**
the existing `seamm_dashboard`, not replace it (yet). See
`~/Work/SEAMM/dashboard-rewrite-plan.md` for the full rationale, architecture
decisions, and phase plan.

- **Backend:** FastAPI, talking directly to `seamm_datastore` (no
  `seamm_dashboard`/Flask dependency). Pip-installable; no conda required.
- **Frontend:** React + Vite + TypeScript, TanStack Query + TanStack Table
  with true server-side pagination.
- **Permissions:** stubbed to always-allow for now (single-user Phase 1);
  see `seamm_webui/auth.py`.

## Backend: development setup

```bash
cd seamm_webui
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
seamm-webui --root ~/SEAMM --port 8010
```

## Frontend: development setup

```bash
cd frontend
npm install
npm run dev
```

## Tests

```bash
pytest tests/
```
