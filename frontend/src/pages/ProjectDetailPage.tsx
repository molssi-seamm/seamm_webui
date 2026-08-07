import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteProject,
  fetchAllJobsForProject,
  fetchProject,
  updateProject,
} from '../api'

const ACTIVE_STATUSES = new Set(['submitted', 'running'])

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  // Same "is there real history to go back to" check JobDetailPage uses --
  // a direct link/reload has nothing to go back to.
  const location = useLocation()
  const canGoBack = location.key !== 'default'
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmName, setConfirmName] = useState('')

  const project = useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id!),
    enabled: !!id,
  })

  // Unpaginated, only to compute how many of this project's jobs are still
  // active -- shown up front in the delete confirmation, not just after
  // the fact (see DELETE /api/projects/{id}'s active_jobs, which is the
  // same information but only known once the deletion already happened).
  const projectJobs = useQuery({
    queryKey: ['project-jobs', project.data?.name],
    queryFn: () => fetchAllJobsForProject(project.data!.name),
    enabled: !!project.data,
  })
  const activeJobCount =
    projectJobs.data?.filter((j) => ACTIVE_STATUSES.has(j.status)).length ?? 0

  const updateMutation = useMutation({
    mutationFn: (payload: { name?: string; description?: string }) =>
      updateProject(id!, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['project', id], updated)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setEditing(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteProject(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigate('/projects')
    },
  })

  if (project.isLoading) return <p>Loading project…</p>
  if (project.error) return <p>Error loading project: {(project.error as Error).message}</p>
  if (!project.data) return null

  const p = project.data

  function startEditing() {
    setEditName(p.name)
    setEditDescription(p.description ?? '')
    setEditing(true)
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const payload: { name?: string; description?: string } = {}
    if (editName !== p.name) payload.name = editName
    if (editDescription !== (p.description ?? '')) payload.description = editDescription
    if (Object.keys(payload).length === 0) {
      setEditing(false)
      return
    }
    updateMutation.mutate(payload)
  }

  return (
    <div>
      <p>
        {canGoBack ? (
          <a
            href="/projects"
            onClick={(e) => {
              e.preventDefault()
              navigate(-1)
            }}
          >
            &larr; Back to projects
          </a>
        ) : (
          <Link to="/projects">&larr; Back to projects</Link>
        )}
      </p>

      {!editing && (
        <>
          <h2>{p.name}</h2>
          <p>{p.description || <em>No description.</em>}</p>
          <p>
            <button onClick={startEditing}>Edit</button>
          </p>
        </>
      )}

      {editing && (
        <form onSubmit={handleSave}>
          <div>
            <label>
              Name{' '}
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </label>
          </div>
          <div>
            <label>
              Description
              <br />
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </label>
          </div>
          <button type="submit" disabled={!editName || updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving…' : 'Save'}
          </button>{' '}
          <button type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
          {updateMutation.isError && (
            <p>Error: {(updateMutation.error as Error).message}</p>
          )}
        </form>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          columnGap: '2em',
          rowGap: '0.25em',
          margin: '1em 0',
          fontSize: '0.95em',
        }}
      >
        <span>
          <strong>Owner:</strong> {p.owner}
        </span>
        <span>
          <strong>Group:</strong> {p.group ?? '—'}
        </span>
        <span>
          <strong>Jobs:</strong> {p.jobs.length}
        </span>
        <span>
          <strong>Flowcharts:</strong> {p.flowcharts.length}
        </span>
      </div>
      {p.path && (
        <p>
          <code>{p.path}</code>
        </p>
      )}

      <p>
        <Link to={`/?project=${encodeURIComponent(p.name)}`}>View jobs &rarr;</Link>
      </p>

      <hr />

      <h3>Delete this project</h3>
      {!confirmDelete && (
        <p>
          <button onClick={() => setConfirmDelete(true)}>Delete project&hellip;</button>
        </p>
      )}
      {confirmDelete && (
        <div>
          <p>
            This permanently deletes <strong>{p.jobs.length}</strong> job(s) and all
            their files from disk.
            {activeJobCount > 0 && (
              <>
                {' '}
                <strong>
                  {activeJobCount} of them {activeJobCount === 1 ? 'is' : 'are'} still
                  submitted/running
                </strong>
                — deleting will not stop it, only remove its files out from under it.
              </>
            )}{' '}
            This cannot be undone.
          </p>
          <p>
            Type <strong>{p.name}</strong> to confirm:{' '}
            <input
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
            />
          </p>
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={confirmName !== p.name || deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Permanently delete'}
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              setConfirmDelete(false)
              setConfirmName('')
            }}
          >
            Cancel
          </button>
          {deleteMutation.isError && (
            <p>Error: {(deleteMutation.error as Error).message}</p>
          )}
        </div>
      )}
    </div>
  )
}
