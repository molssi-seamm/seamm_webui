=======
History
=======

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
