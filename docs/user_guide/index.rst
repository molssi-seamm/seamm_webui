.. _user-guide:

**********
User Guide
**********

``seamm_webui`` is a browser-based dashboard for SEAMM: a job list (with
per-project filtering), a job detail page (status, files, live output,
kill/delete), project management (create/edit/delete), and job submission.

Authentication
==============

Two modes, chosen automatically from how the server is started (see the
Getting Started guide):

- **none** -- no login at all. The default when the server is only
  reachable on the local machine (``--host 127.0.0.1``, the default).
- **local** -- real per-user login, required once the server is reachable
  from other machines. Accounts are created by an administrator with the
  ``seamm-webui-user`` command; there is no self-service signup.

..
   The following sections cover accessing and controlling this functionality
   in more detail.

   .. toctree::
      :maxdepth: 2
      :titlesonly:

Index
=====

* :ref:`genindex`
