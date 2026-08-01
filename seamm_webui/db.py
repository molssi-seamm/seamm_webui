"""Datastore connection management for seamm_webui.

IMPORTANT ordering constraint: ``init_datastore()`` must run before anything
else in this process imports ``seamm_datastore.database.models`` (directly or
transitively, e.g. via a router). ``seamm_datastore``'s internal
``flask_authorize_patch`` decides -- the *first* time it is imported in a
process -- whether to bind to a real Flask ``current_app`` or to the
standalone ``fake_app`` shim that ``SEAMMDatastore.__init__`` sets up. Since
we have no Flask app, importing the models before ``init_datastore()`` has
run would leave that patch trying to use Flask's real (app-context-less)
``current_app`` proxy and crash. ``main.py`` calls ``init_datastore()`` first
and only then imports the routers, which is what keeps this safe.
"""

from pathlib import Path
from typing import Optional

import seamm_datastore

_datastore: Optional["seamm_datastore.connect"] = None


def init_datastore(datastore_dir: str, default_project: str = "default"):
    """Connect to the SEAMM datastore at ``datastore_dir``.

    NOTE: this must be the *datastore* directory (what the rest of SEAMM
    calls ``--datastore``, default ``${root}/Jobs``), not the general
    ``--root`` SEAMM config directory (default ``~/SEAMM``, holding the
    per-code ``.ini`` files) -- those are two different, separately
    configurable directories. Conflating them was a real bug here during
    scaffolding: pointing this at ``~/SEAMM`` directly found no
    ``seamm.db``, silently created a fresh empty one there, and connected
    to that instead of the real datastore at ``~/SEAMM/Jobs/seamm.db``. See
    ``main.py``'s ``--root``/``--datastore`` handling, which mirrors
    ``seamm_util.argument_parser``'s ``${root}/Jobs`` default.

    Only initializes (creates tables/default project/roles) if there is no
    existing ``seamm.db`` at that location yet -- an existing datastore
    (e.g. the one the old ``seamm_dashboard`` already uses) is connected to
    as-is, never dropped/recreated.

    Permission stub (Phase 1, single-user): every seamm_datastore.connect()
    call -- fresh or existing -- bootstraps (or already has) a fixed
    "admin"/"admin" account via `_build_initial`. flask_authorize's
    `authorized()` check short-circuits to allow-everything for any
    admin-role user (see `flask_authorize_patch.py:105-107`), so logging in
    as this fixed account is a real, already-supported "always OK" -- not a
    monkeypatch -- and it's what makes permission-filtered calls like
    `Job.get()`/`Project.get()` actually return rows for an anonymous
    caller. Real per-user auth replaces this fixed login in a later phase --
    see `seamm_webui/auth.py` and dashboard-rewrite-plan.md, Phase 3.
    """
    global _datastore

    root = Path(datastore_dir).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    db_path = root / "seamm.db"
    initialize = not db_path.exists()

    # Note: NOT passing username= here on purpose. seamm_datastore.connect()
    # has a bug (connect.py:201, `self.add_user` does not exist) that's hit
    # when `initialize=True` and a `username` is passed to the constructor
    # itself -- see https://github.com/molssi-seamm/seamm_datastore (file an
    # issue). Logging in as a separate step below avoids that code path
    # entirely and works whether this connection just created the datastore
    # or is attaching to an existing one.
    _datastore = seamm_datastore.connect(
        database_uri=f"sqlite:///{db_path}",
        datastore_location=str(root),
        initialize=initialize,
        default_project=default_project,
    )
    _datastore.login("admin", "admin")

    # Belt-and-suspenders: also allow anonymous actions at the datastore
    # layer, in case any code path checks permissions without a logged-in
    # user (this is what the old seamm_dashboard relies on by default via
    # its `AUTHORIZE_ALLOW_ANONYMOUS_ACTIONS` Flask config flag).
    from seamm_datastore.connect import fake_app

    fake_app.config["AUTHORIZE_ALLOW_ANONYMOUS_ACTIONS"] = True

    return _datastore


def get_datastore():
    if _datastore is None:
        raise RuntimeError(
            "Datastore not initialized; call init_datastore() at app startup."
        )
    return _datastore
