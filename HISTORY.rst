=======
History
=======

2026.8.13.1 -- Live file sync for jobs running on a remote SLURM cluster
    * A job routed to a ``transport = ssh`` queue (a remote SLURM cluster
      with no filesystem shared with the JobServer) runs in a scratch
      directory on that remote host, and its files were previously only
      pulled back once the job finished. The job detail page now pulls
      them back on demand instead -- automatically when the page is
      opened, and again from the file viewer's Refresh button -- so
      files are visible while the job is still running. A job routed
      this way is now marked "remote" next to its queue on the detail
      page.
    * Needs no separate configuration: reuses the same
      ``<root>/<jobserver-name>.ini`` section (``remote_root``, etc.)
      the JobServer itself already uses to stage the job out there, and
      the same lock file the JobServer's own end-of-run pull uses, so
      the two can never run a transfer against the same job
      concurrently. Requires ``seamm_slurm >= 2026.8.13`` and
      ``seamm_jobserver >= 2026.8.13``.
    * Throttled server-side to at most one real transfer attempt every
      15 seconds per job, regardless of how often the page/button asks
      -- safe to leave the page open without generating constant
      ssh/rsync traffic.

2026.8.13 -- A real sidebar, an Admin page, and a friendlier job list
    * New collapsible sidebar (Jobs/Projects/Submit a job, plus Admin for
      an admin account -- see below) replaces the ad hoc per-page
      header/back-links every page used to build on its own, and shows
      whether the backend is reachable. A per-instance ``--name``
      (defaults to ``--jobserver-name``/hostname) now appears in a top
      bar and the browser tab title, so multiple open dashboards are
      distinguishable at a glance.
    * New **Admin** page (in "local" auth mode, for an account with the
      admin role): list every account, create a new one, reset a
      password, or delete an account -- the same operations as the
      ``seamm-webui-user`` command, just from the browser. An account can
      never delete itself, so there is always at least one admin left.
    * The job list can now be filtered by project, status, title
      (substring search), and queue, all combinable -- click a column
      header's funnel icon to filter by that column, Excel-style, rather
      than a separate widget. The Title/Project columns truncate long
      values with an ellipsis (full value on hover) instead of wrapping,
      keeping every row the same height.
    * New First/Last page buttons next to Previous/Next (all four now
      matching media-player-style icons) jump straight to the first or
      last page of the current filter instead of stepping one page at a
      time; the page indicator now shows the total page count when known.
    * Bugfix: the job list's screen-fit page-size calculation re-measured
      row height after every page change, and a fraction-of-a-pixel
      difference between renders could flip the computed page size,
      triggering a refetch that re-measured again -- a resize/refetch
      loop that showed up as fast, unusable flickering on a tall window.
      It now measures once, when the table first has rows, and otherwise
      only on an actual window resize.

2026.8.10.3 -- Add seamm-webui-user delete
    * New ``seamm-webui-user delete <username>`` removes an account
      (confirms interactively unless ``--yes`` is given).

2026.8.10.2 -- Add seamm-webui-user set-password
    * New ``seamm-webui-user set-password <username>`` resets an existing
      account's password. Always prompts interactively (no ``--password``
      flag, unlike ``create``), so a reset never has to pass the new
      password anywhere it could be captured -- shell history, a shared
      terminal session, and so on.

2026.8.10.1 -- Multi-cluster queue picker, and a real frontend port bug
    * New ``GET /api/queues``: lists every queue (cluster/local target) the
      paired JobServer can route jobs to, with each field's override limits
      and current site-default value -- what the Tk desktop submit dialog's
      queue picker reads. Never returns host/transport/credentials, only
      what a submitting client needs. ``seamm-webui`` gained
      ``--jobserver-name`` for the (uncommon) case where a host runs more
      than one independent JobServer instance; defaults to this host's
      hostname, matching ``seamm_jobserver``'s own default.
    * Job listing and detail pages now show which queue a job ran on
      (a new "Queue" column in the jobs list, a "Queue" field on the job
      detail page) -- already present in the API's job data, just not
      previously surfaced in the UI.
    * Bugfix: the built browser UI hardcoded ``http://localhost:8010`` as
      its API address at build time, so it silently broke on *any* other
      host/port the server was actually run on, regardless of what URL
      was used to load the page. The API and the built UI are always
      served by the same process/origin, so the shipped build no longer
      needs (or defaults to) an absolute API URL at all -- only
      ``npm run dev``'s separate-origin Vite dev server still does, and
      that override no longer leaks into the production build.

2026.8.10 -- Serve the built UI directly, and self-contained HTTPS
    * A release install now serves the built browser UI itself -- no separate
      frontend dev server needed in production.
    * When reachable from other machines, a self-signed HTTPS certificate is
      generated and reused automatically if none is supplied
      (``--ssl-certfile``/``--ssl-keyfile``), so no separate reverse proxy is
      needed for encryption.
    * Can now be installed and run as a persistent daemon via
      ``seamm-installer install seamm-webui`` /
      ``seamm-installer services create webui``, in its own dedicated Conda
      environment, alongside the JobServer that actually executes submitted
      jobs.

2026.8.8 -- Initial release
    * Web-based SEAMM dashboard: browse projects and jobs, filter the job list by
      project, and view job status.
    * Submit new jobs from the browser.
    * Job management: monitor, kill, and delete jobs.
    * In-browser file viewer with a directory tree and content pane, including CSV
      tables, Plotly graphs, and 3D structure viewing (CIF/mmCIF/PDB/SDF) via NGL.
    * Real user authentication and project-scoped access control.
