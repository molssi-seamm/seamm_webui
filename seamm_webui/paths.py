# -*- coding: utf-8 -*-

"""Keeping a path that comes from a request inside the directory it belongs in."""

import os
from pathlib import Path


def contained(base, name=""):
    """The real path of ``name`` under the directory ``base``, or None if it is not
    in ``base``.

    Both are resolved with ``os.path.realpath``, which removes ``..`` and follows
    symbolic links, so a crafted name (``../../etc/passwd``, an absolute path, a
    link pointing outside) cannot escape. The test is a prefix test of the
    resolved paths, which static analysis (CodeQL's py/path-injection) recognizes
    as such a guard; ``Path.is_relative_to``, used before, is as safe but is not
    recognized, so every use of a checked path was reported.

    Parameters
    ----------
    base : str or pathlib.Path
        The directory.
    name : str or pathlib.Path
        The path within it, usually from a request; an absolute path is allowed if
        it lies in ``base``.

    Returns
    -------
    pathlib.Path or None
        The resolved path, which may be ``base`` itself.
    """
    root = os.path.realpath(base)
    target = os.path.realpath(os.path.join(root, name))
    if target != root and not target.startswith(root + os.sep):
        return None
    return Path(target)
