=====
Usage
=====

Backend development
====================

From the package directory, in your own virtual environment (no conda
required)::

    $ make lint install test

runs the linters, installs the edited source, and runs the backend test
suite -- see ``make help`` for the full list of targets.

Frontend development
=====================

From ``frontend/``::

    $ npm run dev

starts the Vite dev server; ``make frontend-lint``/``make frontend-build``
(from the package root) run the frontend's own lint/typecheck+build.

Using the library
==================

To use seamm_webui's backend package in a project::

    import seamm_webui
