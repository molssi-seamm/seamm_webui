.. _user-guide:

**********
User Guide
**********

``seamm_webui`` is a browser-based dashboard for SEAMM: a job list (click
a column header's funnel icon to filter by project, status, title, or
queue -- filters combine, and the pager can jump straight to the first or
last page, not just one page at a time), a job detail page (status,
files, live output, kill/delete), project management (create/edit/
delete), and job submission. A collapsible sidebar (Jobs/Projects/Submit
a job, plus Admin -- see below -- for an admin account in "local" mode)
gives access to every page and shows whether the backend is reachable;
clicking Jobs while the job list is already showing refreshes it. If
the paired JobServer has more than one queue configured (see the Getting
Started guide), the job list and detail pages also show which queue each
job ran on, and the list can be filtered by it. A job submitted from the
Submit page goes to the JobServer's default queue with that queue's own
resources; to pick another queue, or to ask for more cores, memory or time
within what the queue's limits allow, submit from the SEAMM desktop app,
whose submit dialog offers them. A job routed to a remote SLURM cluster with no shared
filesystem (a queue's ``transport = ssh``, see the Getting Started guide)
is marked "remote" on its detail page -- its files are pulled back on
demand (opening the page, or clicking a file's Refresh button) while it's
still running, rather than only once it finishes.

A job's detail page switches between its **Files** and its **Tasks**. Files
shows the job's directory as a tree beside a viewer for the selected file. The
folders start closed -- the job's own files are listed first, and each step's
directory is opened level by level -- and **Close all folders**, which stays
at the top of the tree as it scrolls, closes every open one. The open folders
are kept while switching to Tasks and back. Tasks lists the calculations each
step handed to the task layer -- their state, attempts, where they ran and,
for a failure, why -- and each parallel loop's iterations, with their state,
whether each has been merged back into the job, and a link to its output,
which opens that file under Files (and the folders leading to it). It
refreshes every 15 seconds while the job runs; a job on a cluster without a
shared filesystem shows its tasks as of the files last fetched back.

Authentication
==============

Two modes, chosen automatically from how the server is started (see the
Getting Started guide):

- **none** -- no login at all. The default when the server is only
  reachable on the local machine (``--host 127.0.0.1``, the default).
- **local** -- real per-user login, required once the server is reachable
  from other machines. There is no self-service signup; accounts are
  created by an administrator, either with the ``seamm-webui-user``
  command or the web UI's Admin page (see below).

Administration
==============

An account with the ``admin`` role -- every account created so far has
it, whether via the command line or the web UI -- sees an **Admin** entry
in the sidebar (in "local" mode only). It lists every account and can
create a new one, reset a password, or delete an account: the same
operations as ``seamm-webui-user`` (see the Getting Started guide), just
without needing shell access to the machine running the server. An
account can never delete itself, so there is always at least one admin
left to manage the others.

..
   The following sections cover accessing and controlling this functionality
   in more detail.

   .. toctree::
      :maxdepth: 2
      :titlesonly:

Index
=====

* :ref:`genindex`
