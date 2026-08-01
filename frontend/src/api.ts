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

export async function fetchHealth(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/api/health`)
  if (!res.ok) throw new Error(`health check failed: ${res.status}`)
  return res.json()
}

export async function fetchJobs(offset: number, limit: number): Promise<Job[]> {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  })
  const res = await fetch(`${API_BASE}/api/jobs?${params}`)
  if (!res.ok) throw new Error(`fetching jobs failed: ${res.status}`)
  return res.json()
}

export async function fetchJob(id: number | string): Promise<JobDetail> {
  const res = await fetch(`${API_BASE}/api/jobs/${id}`)
  if (!res.ok) throw new Error(`fetching job ${id} failed: ${res.status}`)
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

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/api/projects`)
  if (!res.ok) throw new Error(`fetching projects failed: ${res.status}`)
  return res.json()
}
