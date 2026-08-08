.. highlight:: shell

============
Installation
============


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
