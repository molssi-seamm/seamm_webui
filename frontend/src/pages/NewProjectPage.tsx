import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createProject } from '../api'

// Structurally mirrors SubmitJobPage.tsx: a small form, mutate, then
// navigate to the new resource's detail page.
export function NewProjectPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigate(`/projects/${project.id}`)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({ name, description })
  }

  return (
    <div>
      <p>
        <Link to="/projects">&larr; Back to projects</Link>
      </p>
      <h2>New project</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            Name{' '}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
        </div>
        <div>
          <label>
            Description
            <br />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </div>
        <button type="submit" disabled={!name || mutation.isPending}>
          {mutation.isPending ? 'Creating…' : 'Create'}
        </button>
        {mutation.isError && <p>Error: {(mutation.error as Error).message}</p>}
      </form>
    </div>
  )
}
