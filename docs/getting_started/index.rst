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

Start the server, pointed at an existing SEAMM datastore (defaults to
``~/SEAMM/Jobs``)::

  seamm-webui --datastore ~/SEAMM/Jobs

This is fully self-contained: a release install (from PyPI) bundles the
built browser UI, so there's nothing else to start or configure -- visit
the URL it prints and the dashboard itself is what loads (not just the
API). A source/editable install that hasn't run ``npm run build`` in
``frontend/`` falls back to serving the API only.

By default this binds to ``127.0.0.1`` with no login required -- fine for
using it on your own machine. To make it reachable from other machines,
pass a non-loopback ``--host``; real per-user login then becomes required
automatically (``seamm-webui`` refuses to start otherwise), and so does
HTTPS: with no ``--ssl-certfile``/``--ssl-keyfile`` given, a self-signed
certificate is generated once and reused from then on (browsers will warn
about it being untrusted, the same as any self-signed certificate, until
it's trusted or replaced with a real one). See ``seamm-webui --help`` for
the full set of options, and the User Guide for how authentication works.

For setting this up as a persistent daemon (rather than a foreground
terminal command), see :doc:`../developer_guide/installation`.

Accounts for that login mode are created with the companion
``seamm-webui-user`` command, e.g.::

  seamm-webui-user create alice

That should be enough to get started. For more detail about using the
dashboard, see the :ref:`User Guide <user-guide>`.
