"""Paths from requests stay inside their directory."""

import os

from seamm_webui.paths import contained


def test_contained(tmp_path):
    base = tmp_path / "job"
    (base / "sub").mkdir(parents=True)
    (base / "sub" / "a.txt").write_text("a")
    (tmp_path / "secret.txt").write_text("s")
    (base / "link").symlink_to(tmp_path / "secret.txt")
    (tmp_path / "job2").mkdir()

    assert contained(base, "sub/a.txt") == (base / "sub" / "a.txt").resolve()
    assert contained(base, "sub/../sub/a.txt") == (base / "sub" / "a.txt").resolve()
    assert contained(base, "") == base.resolve()
    # Out of the directory, however it is spelled
    assert contained(base, "../secret.txt") is None
    assert contained(base, "sub/../../secret.txt") is None
    assert contained(base, str(tmp_path / "secret.txt")) is None
    assert contained(base, "link") is None  # a link pointing outside
    # A sibling whose name starts the same is not inside
    assert contained(base, "../job2") is None
    # An absolute path inside is allowed (a job's directory in the datastore)
    assert contained(tmp_path, str(base)) == base.resolve()
    assert contained(base, os.sep) is None
