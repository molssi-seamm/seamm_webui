"""Queue/cluster-target endpoints.

Read-only visibility into the ``<root>/<jobserver-name>.ini`` config the
JobServer paired with this Dashboard uses to route jobs to multiple
clusters/queues (``local``, ``TinkerCliffs``, ``Owl``, ...) -- what a
submission client (the Tk desktop dialog's queue picker, Phase 4) needs to
render a queue dropdown and the per-queue ``.limits``-constrained override
fields. See ``seamm_jobserver``'s
``docs/developer_guide/campaigns/2026-08-10/`` (multi-queue routing) for the
full design; this is Phase 3, the read side.

Deliberately never returns ``transport``/``host``/``remote_*`` -- those are
this host's own system/machine config (how *this* JobServer instance
reaches a cluster), not something a submitting client needs or should see.
"""

from fastapi import APIRouter, Depends

from seamm_webui.auth import require_permission
from seamm_webui.queue_config import get_jobserver_name, get_root

router = APIRouter(prefix="/api/queues", tags=["queues"])


def _serialize_limits(limits, directives):
    """``current`` is this queue's own site-default value for the
    directive (e.g. ``ntasks = 1``), if it sets one -- not a secret, and
    useful context for a client rendering an override field ("currently
    1, choose up to 6") rather than showing an unexplained blank."""
    return {
        name: {
            "choices": field_limits.choices,
            "minimum": field_limits.minimum,
            "maximum": field_limits.maximum,
            "current": directives.get(name),
        }
        for name, field_limits in limits.items()
    }


@router.get("")
def list_queues(_: None = Depends(require_permission("read"))):
    """List every queue the paired JobServer instance can route jobs to.

    Empty if no ``root`` was configured for this Dashboard (see
    ``queue_config.configure()``) or no ``<root>/<jobserver-name>.ini``
    exists there -- both mean "the queue feature isn't in use here",
    exactly as a JobServer with no such file runs every job as a plain
    local subprocess.
    """
    root = get_root()
    if root is None:
        return []

    from seamm_slurm.config import list_sections, load_slurm_config

    jobserver_name = get_jobserver_name()
    sections = list_sections(root, jobserver_name)
    if not sections:
        return []

    # Best-effort: an ambiguous config (multiple sections, no [DEFAULT]
    # default=) is a real problem for the JobServer itself (it won't even
    # start), but this is a read-only status endpoint -- report the
    # queues that do exist rather than failing the whole listing over a
    # site misconfiguration only the JobServer needs to enforce.
    try:
        default_section = load_slurm_config(root, jobserver_name)
    except RuntimeError:
        default_section = None
    default_name = default_section.name if default_section is not None else None

    return [
        {
            "name": name,
            "type": section.type,
            "default": name == default_name,
            "limits": _serialize_limits(section.limits, section.directives),
        }
        for name, section in sorted(sections.items())
    ]
