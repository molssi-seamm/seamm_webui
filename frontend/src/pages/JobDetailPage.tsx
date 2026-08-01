import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchJob, fetchJobFiles, jobFileDownloadUrl } from '../api'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Phase 1: status/parameters/files. No flowchart preview yet -- that's a
// separate follow-up (porting the old dashboard's read-only Cytoscape
// rendering), tracked in dashboard-rewrite-plan.md.
export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()

  const job = useQuery({
    queryKey: ['job', id],
    queryFn: () => fetchJob(id!),
    enabled: !!id,
  })

  const files = useQuery({
    queryKey: ['job-files', id],
    queryFn: () => fetchJobFiles(id!),
    enabled: !!id,
  })

  if (job.isLoading) return <p>Loading job…</p>
  if (job.error) return <p>Error loading job: {(job.error as Error).message}</p>
  if (!job.data) return null

  const j = job.data

  return (
    <div>
      <p>
        <Link to="/">&larr; Back to jobs</Link>
      </p>
      <h2>
        Job {j.id}: {j.title}
      </h2>
      <table>
        <tbody>
          <tr>
            <th>Status</th>
            <td>{j.status}</td>
          </tr>
          <tr>
            <th>Projects</th>
            <td>{j.projects.map((p) => p.name).join(', ')}</td>
          </tr>
          <tr>
            <th>Submitted</th>
            <td>{j.submitted}</td>
          </tr>
          <tr>
            <th>Started</th>
            <td>{j.started}</td>
          </tr>
          <tr>
            <th>Finished</th>
            <td>{j.finished}</td>
          </tr>
          <tr>
            <th>Description</th>
            <td>{j.description}</td>
          </tr>
          <tr>
            <th>Path</th>
            <td>
              <code>{j.path}</code>
            </td>
          </tr>
        </tbody>
      </table>

      <h3>Parameters</h3>
      <pre>{JSON.stringify(j.parameters, null, 2)}</pre>

      <h3>Files</h3>
      {files.isLoading && <p>Loading files…</p>}
      {files.error && <p>Error loading files: {(files.error as Error).message}</p>}
      {files.data && (
        <table>
          <thead>
            <tr>
              <th>Path</th>
              <th>Size</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {files.data.map((f) => (
              <tr key={f.path}>
                <td>{f.path}</td>
                <td>{formatSize(f.size)}</td>
                <td>
                  <a href={jobFileDownloadUrl(id!, f.path)}>Download</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
