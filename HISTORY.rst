=======
History
=======

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
