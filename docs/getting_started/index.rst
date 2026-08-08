***************
Getting Started
***************

Installation
============

``seamm_webui`` is pip-installable and does not require conda or the rest
of the SEAMM stack to be installed first (though it does need a SEAMM
datastore to point at)::

  pip install seamm_webui

Running it
==========

Start the backend, pointed at an existing SEAMM datastore (defaults to
``~/SEAMM/Jobs``)::

  seamm-webui --datastore ~/SEAMM/Jobs

By default this binds to ``127.0.0.1`` with no login required -- fine for
using it on your own machine. To make it reachable from other machines,
pass a non-loopback ``--host``; real per-user login then becomes required
automatically (``seamm-webui`` refuses to start otherwise). See
``seamm-webui --help`` for the full set of options, and the User Guide for
how authentication works.

Accounts for that login mode are created with the companion
``seamm-webui-user`` command, e.g.::

  seamm-webui-user create alice

That should be enough to get started. For more detail about using the
dashboard, see the :ref:`User Guide <user-guide>`.
