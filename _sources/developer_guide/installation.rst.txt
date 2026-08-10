.. highlight:: shell

============
Installation
============

Production deployment
----------------------

For a persistent, self-contained install -- not a foreground terminal
command -- use ``seamm-installer`` (the same tool that installs and
daemonizes the rest of SEAMM, including the legacy Dashboard and the
JobServer). It creates a dedicated ``seamm-webui`` Conda environment
(``seamm_webui`` doesn't share much with the rest of the SEAMM stack, so it
stays out of the main ``seamm`` environment), installs ``seamm_webui`` from
PyPI into it, and sets up a systemd (Linux) or launchd (macOS) service:

.. code-block:: console

    $ seamm-installer install seamm-webui
    $ seamm-installer services create webui

By default the created service binds to ``0.0.0.0`` (reachable from other
machines) -- pass ``--webui-host 127.0.0.1`` to ``services create`` instead
for a local-only install. Once reachable from other machines,
``seamm_webui`` requires both real per-user login (see the
:ref:`User Guide <user-guide>`, accounts are created with
``seamm-webui-user create``) and HTTPS automatically: with no certificate
supplied it generates and reuses its own self-signed certificate (under
``--root``, i.e. ``~/SEAMM`` by default) the first time it starts, the same
way an SSH server generates a host key on first boot. Browsers will warn
about it being untrusted until it's trusted manually or replaced with a
real certificate -- pass ``--ssl-certfile``/``--ssl-keyfile`` (forwarded by
``seamm-installer services create`` if set) to use one instead. Getting a
browser-trusted certificate automatically (Let's Encrypt-style) isn't
attempted -- it requires the host to be publicly reachable on a real DNS
name, which doesn't hold for typical cluster-internal deployments.

``seamm_webui`` never executes jobs itself -- a separate ``seamm_jobserver``
daemon, polling the same datastore, does that. Set it up alongside webui or
submitted jobs will simply sit unprocessed:

.. code-block:: console

    $ seamm-installer services create jobserver

See ``seamm-installer services --help`` for ``status``/``stop``/``delete``,
and :doc:`../getting_started/index` for running ``seamm-webui`` directly
(not as a daemon) for local/interactive use.

Stable release
--------------

To install seamm_webui, run this command in your terminal:

.. code-block:: console

    $ pip install seamm_webui

This is the preferred method to install seamm_webui, as it will always
install the most recent stable release.

If you don't have `pip`_ installed, this `Python installation guide`_ can
guide you through the process.

.. _pip: https://pip.pypa.io
.. _Python installation guide: http://docs.python-guide.org/en/latest/starting/installation/


From sources
------------

The sources for seamm_webui can be downloaded from the `Github repo`_.

You can either clone the public repository:

.. code-block:: console

    $ git clone git://github.com/molssi-seamm/seamm_webui

Or download the `tarball`_:

.. code-block:: console

    $ curl -OL https://github.com/molssi-seamm/seamm_webui/tarball/main

Once you have a copy of the source, install the backend with:

.. code-block:: console

    $ pip install .

and, for frontend development, install the JS dependencies separately:

.. code-block:: console

    $ cd frontend && npm install


.. _Github repo: https://github.com/molssi-seamm/seamm_webui
.. _tarball: https://github.com/molssi-seamm/seamm_webui/tarball/main
