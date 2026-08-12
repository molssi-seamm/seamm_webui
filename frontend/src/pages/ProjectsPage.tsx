import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchProjects } from '../api'

// Plain, unpaginated table -- real data tops out around 20 projects, so
// none of JobsPage's viewport-fit/pagination machinery is needed here.
export function ProjectsPage() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: fetchProjects })

  return (
    <div>
      <h2>Projects</h2>
      <p>
        <Link to="/projects/new">+ New project</Link>
      </p>

      {projects.isLoading && <p>Loading projects…</p>}
      {projects.error && <p>Error loading projects: {(projects.error as Error).message}</p>}

      {projects.data && (
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Owner</th>
              <th># Jobs</th>
            </tr>
          </thead>
          <tbody>
            {projects.data.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/projects/${p.id}`}>{p.name}</Link>
                </td>
                <td>{p.description || ''}</td>
                <td>{p.owner}</td>
                <td>{p.jobs.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
