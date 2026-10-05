"""A job's tasks and parallel-loop iterations, read from its files.

Read-only: the task manifests the task layer keeps in each step directory
(``<step>/tasks/manifest.json``), the iterations of parallel loops
(``<loop>/<iteration>/_evaluator/``, each with its ``job_data.json`` and
``checkpoint.json``), and the job's own checkpoint, whose frame for a running
parallel loop says which iterations are merged and which failed. No database.
"""

import json
import os
from pathlib import Path
import time

#: Task states, in the order the panel lists counts
TASK_STATES = ("queued", "running", "finished", "failed", "cancelled", "lost")
#: Directories never searched: bundle bookkeeping, and an iteration's own
#: files (its step directories are in the job's tree, not there)
SKIP = {"_bundles", "_evaluator", "previous", "__pycache__"}


def _read_json(path):
    """A JSON file, tolerating a header line before the JSON (job_data.json)."""
    try:
        text = Path(path).read_text()
    except OSError:
        return None
    start = text.find("{")
    if start < 0:
        return None
    try:
        return json.loads(text[start:])
    except ValueError:
        return None


def _task_rows(manifest):
    rows = []
    for key, record in (manifest.get("tasks") or {}).items():
        history = record.get("history") or []
        reason = record.get("reason")
        if reason is None and history:
            reason = history[-1].get("reason")
        rows.append(
            {
                "key": key,
                "state": record.get("state") or "queued",
                "attempts": record.get("attempts", 0),
                "backend": record.get("backend"),
                "id": record.get("id"),
                "bundle": record.get("bundle"),
                "archive": record.get("archive"),
                "reason": reason,
            }
        )
    return rows


def _frames(checkpoint_path):
    """The running parallel loops in a checkpoint: ``{loop directory: state}``.

    A step's directory is its numbered id joined with "/" (``4``, or
    ``3/iter_1/2`` for a step inside an iteration of a loop), which is how the
    checkpoint names the loop.
    """
    checkpoint = _read_json(checkpoint_path) or {}
    frames = {}
    for frame in checkpoint.get("position") or []:
        loop = frame.get("loop")
        node = frame.get("node")
        if isinstance(loop, dict) and loop.get("parallel") and node:
            frames["/".join(str(n) for n in node)] = loop
    return frames


def _frame_for(base, loop):
    """The checkpoint frame of the parallel loop in directory ``loop``.

    A loop nested in an iteration of another parallel loop is run by that
    iteration's own evaluator, so its frame is in the iteration's checkpoint
    (``<iteration>/_evaluator/checkpoint.json``), not the job's.
    """
    parts = Path(loop).parts
    for n in range(len(parts) - 1, 0, -1):
        evaluator = base.joinpath(*parts[:n]) / "_evaluator" / "checkpoint.json"
        if evaluator.exists():
            return _frames(evaluator).get(loop)
    return _frames(base / "checkpoint.json").get(loop)


def _iteration_row(directory, name, frame):
    evaluator = directory / name / "_evaluator"
    data = _read_json(evaluator / "job_data.json") or {}
    checkpoint = _read_json(evaluator / "checkpoint.json") or {}
    outcome = data.get("iteration") or checkpoint.get("iteration") or {}
    state = data.get("state") or checkpoint.get("state") or "queued"
    if outcome.get("done"):
        state = "finished"
        if outcome.get("break"):
            state = "finished (break)"
        elif outcome.get("skip"):
            state = "finished (skipped)"
    row = {
        "name": name,
        "state": state,
        "started": data.get("start time"),
        "ended": data.get("end time"),
        "job_out": f"{name}/_evaluator/job.out",
        "iteration_out": f"{name}/iteration.out",
        "merged": None,
        "failed": None,
    }
    if frame is not None:
        numbers = {v: int(k) for k, v in (frame.get("directories") or {}).items()}
        k = numbers.get(name)
        if k is not None:
            row["number"] = k
            row["failed"] = k in (frame.get("failed") or [])
            row["merged"] = k < frame.get("next", 1) and not row["failed"]
    return row


def job_tasks(job_directory, max_depth=12):
    """The tasks of every step, and the iterations of every parallel loop.

    Returns
    -------
    dict
        ``{"steps": [{"step", "counts", "tasks"}], "loops": [{"loop",
        "running", "iterations"}], "as_of": seconds since the epoch}``
    """
    base = Path(job_directory)
    result = {"steps": [], "loops": [], "as_of": time.time()}
    if not base.is_dir():
        return result
    for dirpath, dirnames, filenames in os.walk(base):
        here = Path(dirpath)
        relative = here.relative_to(base)
        depth = len(relative.parts)
        # A parallel loop: subdirectories that are iterations with evaluators
        iterations = [
            d for d in dirnames if (here / d / "_evaluator").is_dir() and d not in SKIP
        ]
        if iterations:
            loop = str(relative)
            frame = _frame_for(base, loop)
            rows = [_iteration_row(here, d, frame) for d in sorted(iterations)]
            rows.sort(
                key=lambda r: (r.get("number") is None, r.get("number"), r["name"])
            )
            result["loops"].append(
                {"loop": loop, "running": frame is not None, "iterations": rows}
            )
        if here.name == "tasks" and "manifest.json" in filenames:
            manifest = _read_json(here / "manifest.json") or {}
            rows = _task_rows(manifest)
            counts = {s: 0 for s in TASK_STATES}
            for row in rows:
                counts[row["state"]] = counts.get(row["state"], 0) + 1
            result["steps"].append(
                {"step": str(relative.parent), "counts": counts, "tasks": rows}
            )
        dirnames[:] = [
            d for d in sorted(dirnames) if d not in SKIP and depth < max_depth
        ]
        if here.name == "tasks":
            dirnames[:] = []  # the task directories themselves hold no manifests
    return result
