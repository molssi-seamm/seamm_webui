#!/usr/bin/env python
"""Minimal setup.py -- only supplies the versioneer-derived version and
cmdclass. All other metadata (name, dependencies, console scripts, ...)
is declared in pyproject.toml; `version` is marked `dynamic` there
because versioneer has no pyproject.toml-native mode.
"""
from setuptools import setup

import versioneer

setup(
    version=versioneer.get_version(),
    cmdclass=versioneer.get_cmdclass(),
)
