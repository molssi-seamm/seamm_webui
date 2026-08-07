export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8010'

export interface Job {
  id: number
  title: string
  status: string
  submitted: string | null
  started: string | null
  finished: string | null
}

export interface JobDetail extends Job {
  description: string
  path: string
  parameters: Record<string, unknown>
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

export async function fetchHealth(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/api/health`)
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
  const res = await fetch(`${API_BASE}/api/jobs?${params}`)
  if (!res.ok) throw new Error(`fetching jobs failed: ${res.status}`)
  return res.json()
}

export async function fetchJob(id: number | string): Promise<JobDetail> {
  const res = await fetch(`${API_BASE}/api/jobs/${id}`)
  if (!res.ok) throw new Error(`fetching job ${id} failed: ${res.status}`)
  return res.json()
}

// Requests that seamm_jobserver stop this job, keeping its files (unlike
// deleteProject, which removes them). Only a request: the returned status
// is "kill", not yet "killed" -- seamm_jobserver polls for "kill" and
// flips it to "killed" itself, out of band.
export async function killJob(id: number | string): Promise<JobDetail> {
  const res = await fetch(`${API_BASE}/api/jobs/${id}/kill`, { method: 'POST' })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`killing job ${id} failed: ${res.status} ${detail}`)
  }
  return res.json()
}

export async function deleteJob(id: number | string): Promise<{ deleted: boolean }> {
  const res = await fetch(`${API_BASE}/api/jobs/${id}`, { method: 'DELETE' })
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
  const res = await fetch(`${API_BASE}/api/jobs/kill`, {
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
  const res = await fetch(`${API_BASE}/api/jobs/delete`, {
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
  const res = await fetch(`${API_BASE}/api/jobs/${id}/files`)
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
  const res = await fetch(`${API_BASE}/api/jobs/${id}/files/content?${params}`)
  if (!res.ok) throw new Error(`fetching content of ${filename} failed: ${res.status}`)
  return res.json()
}

export async function fetchProjects(): Promise<ProjectDetail[]> {
  const res = await fetch(`${API_BASE}/api/projects`)
  if (!res.ok) throw new Error(`fetching projects failed: ${res.status}`)
  return res.json()
}

export async function fetchProject(id: number | string): Promise<ProjectDetail> {
  const res = await fetch(`${API_BASE}/api/projects/${id}`)
  if (!res.ok) throw new Error(`fetching project ${id} failed: ${res.status}`)
  return res.json()
}

export interface ProjectSubmission {
  name: string
  description?: string
}

export async function createProject(payload: ProjectSubmission): Promise<ProjectDetail> {
  const res = await fetch(`${API_BASE}/api/projects`, {
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
  const res = await fetch(`${API_BASE}/api/projects/${id}`, {
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
  const res = await fetch(`${API_BASE}/api/projects/${id}`, { method: 'DELETE' })
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
  const res = await fetch(`${API_BASE}/api/jobs?${params}`)
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
  const res = await fetch(`${API_BASE}/api/jobs`, {
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
