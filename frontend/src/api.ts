// The production build (what seamm_webui actually ships/installs) is
// always served by the same FastAPI process as the API itself -- same
// origin, whatever host/port that process happens to run on (8010, 55155,
// ..., chosen at `seamm-webui` invocation time, not at frontend build
// time). So the default here is deliberately relative ('') rather than
// any hardcoded absolute origin: a hardcoded port baked into the compiled
// bundle would silently break every time the server's port changes --
// exactly what happened when the dev deployment moved from 8010 to 55155
// and the bundle, built once with a fixed .env, kept fetching the dead
// old port no matter what URL the page itself was loaded from.
//
// The one real exception is local frontend development: `npm run dev`
// serves the frontend from Vite's own dev server (localhost:5173) while
// the API runs as a separately-started `seamm-webui` process on a
// different port -- genuinely cross-origin, so that case needs an
// explicit absolute VITE_API_BASE. That's set in `.env.development`
// (Vite-mode-scoped, so `npm run build`'s production bundle never sees
// it and falls through to the relative default here), deliberately using
// `localhost`, not `127.0.0.1`, to match Vite's own dev server URL (also
// `localhost:5173`): both resolve to the same loopback address, but
// browsers treat them as different *sites* for SameSite cookie purposes
// (not just different origins) -- a `SameSite=Lax` session cookie set by
// `127.0.0.1:<port>` would silently never be attached to fetch()/XHR
// calls from a page loaded at `localhost:5173`, since Lax only allows
// cross-*site* requests on top-level navigations, not subresource
// fetches. Same hostname, different port, is same-site regardless of
// SameSite policy, so that pairing is what actually works.
export const API_BASE = import.meta.env.VITE_API_BASE ?? ''

// All requests go through this so the session cookie is always sent.
// 'include' (not just the fetch default of 'same-origin') matters
// specifically for the Vite-dev-server case above, where the frontend and
// API are different origins (same site, different port); harmless and
// unnecessary but not wrong for the normal same-origin production case.
async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, { ...options, credentials: 'include' })
}

export interface Job {
  id: number
  title: string
  status: string
  submitted: string | null
  started: string | null
  finished: string | null
  // seamm_jobserver's multi-queue routing (2026-08-10 campaign) records
  // which queue/cluster a job ran on here (parameters.queue) -- absent for
  // any JobServer instance not using the feature, so callers must treat
  // it as optional. Already present in both the list and detail API
  // responses (JobSchema.dump() includes the raw parameters JSON as-is,
  // not a curated field list), so no backend change was needed to surface
  // it in the frontend.
  parameters: Record<string, unknown>
}

export interface JobDetail extends Job {
  description: string
  path: string
  projects: { id: number; name: string }[]
}

export interface JobFile {
  path: string
  size: number
}

export interface Project {
  id: number
  name: string
}

export interface ProjectDetail extends Project {
  description: string | null
  path: string | null
  owner: string
  group: string | null
  jobs: number[]
  flowcharts: number[]
}

export interface CurrentUser {
  auth_mode: 'none' | 'local'
  username: string | null
  is_admin: boolean
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const res = await apiFetch('/api/auth/me')
  if (!res.ok) throw new Error(`fetching current user failed: ${res.status}`)
  return res.json()
}

export async function login(
  username: string,
  password: string,
): Promise<{ username: string; is_admin: boolean }> {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`login failed: ${res.status} ${detail}`)
  }
  return res.json()
}

export async function logout(): Promise<void> {
  const res = await apiFetch('/api/auth/logout', { method: 'POST' })
  if (!res.ok) throw new Error(`logout failed: ${res.status}`)
}

export async function fetchHealth(): Promise<{ status: string; name: string }> {
  const res = await apiFetch('/api/health')
  if (!res.ok) throw new Error(`health check failed: ${res.status}`)
  return res.json()
}

export async function fetchJobs(
  offset: number,
  limit: number,
  project?: string,
): Promise<Job[]> {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
    // Newest jobs first -- that's what users want to see by default.
    sort_by: 'id',
    order: 'desc',
  })
  if (project) params.set('project', project)
  const res = await apiFetch(`/api/jobs?${params}`)
  if (!res.ok) throw new Error(`fetching jobs failed: ${res.status}`)
  return res.json()
}

export async function fetchJob(id: number | string): Promise<JobDetail> {
  const res = await apiFetch(`/api/jobs/${id}`)
  if (!res.ok) throw new Error(`fetching job ${id} failed: ${res.status}`)
  return res.json()
}

// Requests that seamm_jobserver stop this job, keeping its files (unlike
// deleteProject, which removes them). Only a request: the returned status
// is "kill", not yet "killed" -- seamm_jobserver polls for "kill" and
// flips it to "killed" itself, out of band.
export async function killJob(id: number | string): Promise<JobDetail> {
  const res = await apiFetch(`/api/jobs/${id}/kill`, { method: 'POST' })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`killing job ${id} failed: ${res.status} ${detail}`)
  }
  return res.json()
}

export async function deleteJob(id: number | string): Promise<{ deleted: boolean }> {
  const res = await apiFetch(`/api/jobs/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`deleting job ${id} failed: ${res.status} ${detail}`)
  }
  return res.json()
}

export interface BulkKillResult {
  killed: number[]
  skipped: number[]
  not_found: number[]
}

// Bulk version of killJob, for the job list's "Kill selected". Never
// throws over individual jobs that aren't killable (e.g. already
// finished) -- those come back in `skipped`, not as an error.
export async function killJobs(ids: number[]): Promise<BulkKillResult> {
  const res = await apiFetch('/api/jobs/kill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`killing jobs failed: ${res.status} ${detail}`)
  }
  return res.json()
}

export interface BulkDeleteResult {
  deleted: number[]
  not_found: number[]
}

export async function deleteJobs(ids: number[]): Promise<BulkDeleteResult> {
  const res = await apiFetch('/api/jobs/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`deleting jobs failed: ${res.status} ${detail}`)
  }
  return res.json()
}

export async function fetchJobFiles(id: number | string): Promise<JobFile[]> {
  const res = await apiFetch(`/api/jobs/${id}/files`)
  if (!res.ok) throw new Error(`fetching files for job ${id} failed: ${res.status}`)
  return res.json()
}

export function jobFileDownloadUrl(id: number | string, filename: string): string {
  const params = new URLSearchParams({ filename })
  return `${API_BASE}/api/jobs/${id}/files/download?${params}`
}

export interface JobFileContent {
  content: string | null
  reason: 'binary' | 'too_large' | null
  size: number
}

export async function fetchJobFileContent(
  id: number | string,
  filename: string,
): Promise<JobFileContent> {
  const params = new URLSearchParams({ filename })
  const res = await apiFetch(`/api/jobs/${id}/files/content?${params}`)
  if (!res.ok) throw new Error(`fetching content of ${filename} failed: ${res.status}`)
  return res.json()
}

export async function fetchProjects(): Promise<ProjectDetail[]> {
  const res = await apiFetch('/api/projects')
  if (!res.ok) throw new Error(`fetching projects failed: ${res.status}`)
  return res.json()
}

export async function fetchProject(id: number | string): Promise<ProjectDetail> {
  const res = await apiFetch(`/api/projects/${id}`)
  if (!res.ok) throw new Error(`fetching project ${id} failed: ${res.status}`)
  return res.json()
}

export interface ProjectSubmission {
  name: string
  description?: string
}

export async function createProject(payload: ProjectSubmission): Promise<ProjectDetail> {
  const res = await apiFetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`creating project failed: ${res.status} ${detail}`)
  }
  return res.json()
}

export async function updateProject(
  id: number | string,
  payload: Partial<ProjectSubmission>,
): Promise<ProjectDetail> {
  const res = await apiFetch(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`updating project ${id} failed: ${res.status} ${detail}`)
  }
  return res.json()
}

export interface ProjectDeleteResult {
  deleted: boolean
  active_jobs: { id: number; title: string; status: string }[]
}

export async function deleteProject(id: number | string): Promise<ProjectDeleteResult> {
  const res = await apiFetch(`/api/projects/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`deleting project ${id} failed: ${res.status} ${detail}`)
  }
  return res.json()
}

// Unpaginated -- used only to compute an active-job count for the project
// delete confirmation, not for browsing (JobsPage's fetchJobs is the
// paginated one for that). Omitting offset/limit makes the backend return
// every matching job (routers/jobs.py only applies them if given).
export async function fetchAllJobsForProject(project: string): Promise<Job[]> {
  const params = new URLSearchParams({ project })
  const res = await apiFetch(`/api/jobs?${params}`)
  if (!res.ok) throw new Error(`fetching jobs for project ${project} failed: ${res.status}`)
  return res.json()
}

export interface JobSubmission {
  flowchart: string
  project: string
  title: string
  description?: string
}

export async function submitJob(payload: JobSubmission): Promise<JobDetail> {
  const res = await apiFetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`submitting job failed: ${res.status} ${detail}`)
  }
  return res.json()
}

// Admin: web equivalent of manage.py's seamm-webui-user CLI
// (routers/admin.py) -- "local"-auth-mode account management, gated
// server-side by the admin role, not just being logged in.
export interface AdminUser {
  username: string
  email: string | null
  first_name: string | null
  last_name: string | null
  roles: string[]
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await apiFetch('/api/admin/users')
  if (!res.ok) throw new Error(`fetching users failed: ${res.status}`)
  return res.json()
}

export interface AdminUserCreate {
  username: string
  password: string
  email?: string
  first_name?: string
  last_name?: string
}

export async function createAdminUser(payload: AdminUserCreate): Promise<AdminUser> {
  const res = await apiFetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`creating user failed: ${res.status} ${detail}`)
  }
  return res.json()
}

export async function setAdminUserPassword(username: string, password: string): Promise<void> {
  const res = await apiFetch(`/api/admin/users/${encodeURIComponent(username)}/set-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`setting password for ${username} failed: ${res.status} ${detail}`)
  }
}

export async function deleteAdminUser(username: string): Promise<void> {
  const res = await apiFetch(`/api/admin/users/${encodeURIComponent(username)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`deleting user ${username} failed: ${res.status} ${detail}`)
  }
}
