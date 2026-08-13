import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchProjects, submitJob } from '../api'

export function SubmitJobPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const projects = useQuery({ queryKey: ['projects'], queryFn: fetchProjects })

  const [project, setProject] = useState('default')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [flowchartText, setFlowchartText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: submitJob,
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      navigate(`/jobs/${job.id}`)
    },
  })

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setFlowchartText(await file.text())
    if (!title) setTitle(file.name.replace(/\.flow$/, ''))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({
      flowchart: flowchartText,
      project,
      title,
      description,
    })
  }

  return (
    <div>
      <h2>Submit a job</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            Flowchart file (.flow){' '}
            <input type="file" accept=".flow" onChange={handleFileChange} required />
          </label>
          {fileName && <p>Selected: {fileName}</p>}
        </div>
        <div>
          <label>
            Project{' '}
            <select value={project} onChange={(e) => setProject(e.target.value)}>
              {projects.data?.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <label>
            Title{' '}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
        <button type="submit" disabled={!flowchartText || mutation.isPending}>
          {mutation.isPending ? 'Submitting…' : 'Submit'}
        </button>
        {mutation.isError && <p>Error: {(mutation.error as Error).message}</p>}
      </form>
    </div>
  )
}
