const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8010'

export interface Job {
  id: number
  title: string
  status: string
  submitted: string | null
  started: string | null
  finished: string | null
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

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/api/projects`)
  if (!res.ok) throw new Error(`fetching projects failed: ${res.status}`)
  return res.json()
}
