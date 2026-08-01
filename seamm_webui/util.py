"""Job submission utilities.

get_job_id() and the flowchart/job_data.json writing logic are ported from
seamm_dashboard/util.py and seamm_dashboard/routes/api/jobs.py's add_job --
deliberately NOT imported from seamm_dashboard (that package must never be
imported into this process, see the Base/sys.modules note in db.py). Both
dashboards point at the same job.id file (see dashboard-rewrite-plan.md),
so this must stay wire-compatible with the original format.
"""

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import fasteners


def get_job_id(filename: str) -> int:
    """Get the next job id from the given file, incrementing it atomically.

    Uses an inter-process file lock so concurrent submissions -- from this
    dashboard, the old one, or a job array -- get unique, monotonically
    increasing ids.
    """
    filename = os.path.expanduser(filename)

    lock_file = filename + ".lock"
    lock = fasteners.InterProcessLock(lock_file)
    locked = lock.acquire(blocking=True, timeout=5)

    if not locked:
        raise RuntimeError(f"Could not lock the job_id file '{filename}'")

    try:
        if not os.path.isfile(filename):
            job_id = 1
            with open(filename, "w") as fd:
                fd.write("!MolSSI job_id 1.0\n")
                fd.write("1\n")
            return job_id

        with open(filename, "r+") as fd:
            line = fd.readline()
            pos = fd.tell()
            if line == "":
                raise EOFError(f"job_id file '{filename}' is empty")
            line = line.strip()
            match = re.fullmatch(r"!MolSSI job_id ([0-9]+(?:\.[0-9]+)*)", line)
            if match is None:
                raise RuntimeError(f"The job_id file has an incorrect header: {line}")
            line = fd.readline()
            if line == "":
                raise EOFError(f"job_id file '{filename}' is truncated")
            job_id = int(line)
            job_id += 1
            fd.seek(pos)
            fd.write(f"{job_id:d}\n")
        return job_id
    finally:
        lock.release()


def write_job_files(
    datastore_dir: str,
    project_name: str,
    job_id: int,
    flowchart: str,
    title: str,
    project_names: list,
    parameters: dict,
) -> str:
    """Write flowchart.flow + job_data.json for a new job.

    Returns the job's directory path (as a string).
    """
    datastore_path = Path(datastore_dir).expanduser()
    directory = datastore_path / "projects" / project_name / f"Job_{job_id:06d}"
    directory.mkdir(parents=True, exist_ok=True)

    (directory / "flowchart.flow").write_text(flowchart)

    data = {
        "data_version": "1.0",
        "command line": parameters.get("cmdline", []),
        "title": title,
        "working directory": str(directory),
        "state": "submitted",
        "projects": project_names,
        "datastore": str(datastore_path),
        "job id": job_id,
        "submitted": datetime.now(timezone.utc).isoformat(),
    }
    with (directory / "job_data.json").open("w") as fd:
        fd.write("!MolSSI job_data 1.0\n")
        json.dump(data, fd, sort_keys=True, indent=3)

    return str(directory)
