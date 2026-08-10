"""Queue/cluster-target config for seamm_webui.

The queues a submitted job can be routed to (``local``, ``TinkerCliffs``,
``Owl``, ...) live in ``<root>/<jobserver-name>.ini`` -- a system/machine
config file the JobServer paired with this Dashboard already reads (see
``seamm_slurm.config``), not something seamm_webui itself owns. This module
just remembers where to find it, the same way ``db.py`` remembers the
datastore location: set once at startup by ``main.py``'s ``create_app()``,
read by ``routers/queues.py``.

``root`` is the general SEAMM config root (``~/SEAMM`` by default) -- NOT
the datastore directory (``db.py``'s ``get_datastore_dir()``), same
``--root`` vs ``--datastore`` distinction documented there. ``jobserver_name``
defaults to this host's hostname, matching ``seamm_jobserver``'s own
``--name`` default, so the common one-JobServer-per-host case needs no
extra configuration; a host running more than one independent JobServer
instance needs ``--jobserver-name`` set explicitly to disambiguate which
one this Dashboard is paired with.

See ``seamm_jobserver``'s ``docs/developer_guide/campaigns/2026-08-10/``
(multi-queue routing) for the full design.
"""

from typing import Optional

_root: Optional[str] = None
_jobserver_name: Optional[str] = None


def configure(root: Optional[str], jobserver_name: str) -> None:
    """Called once by ``create_app()`` at startup. ``root=None`` means "no
    queue config available" -- ``routers/queues.py`` then reports no
    queues at all, the same "feature doesn't exist" convention
    ``seamm_slurm.load_slurm_config()`` uses for a missing ini file."""
    global _root, _jobserver_name
    _root = root
    _jobserver_name = jobserver_name


def get_root() -> Optional[str]:
    return _root


def get_jobserver_name() -> Optional[str]:
    return _jobserver_name
