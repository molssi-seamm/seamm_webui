import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchJobTasks, syncJobFiles, type JobLoop, type JobStepTasks } from './api'

// The order states are shown in, and their colors.
const STATES = ['queued', 'running', 'finished', 'failed', 'cancelled', 'lost']
const COLORS: Record<string, string> = {
  queued: '#888',
  running: '#1f6feb',
  finished: '#2da44e',
  failed: '#cf222e',
  cancelled: '#9a6700',
  lost: '#9a6700',
}

const cell: React.CSSProperties = { padding: '2px 8px', textAlign: 'left', whiteSpace: 'nowrap' }

function StateBadge({ state }: { state: string }) {
  const base = state.split(' ')[0]
  return <span style={{ color: COLORS[base] ?? 'inherit', fontWeight: 600 }}>{state}</span>
}

function LoopTable({ loop, onOpenFile }: { loop: JobLoop; onOpenFile: (path: string) => void }) {
  const prefix = loop.loop === '.' ? '' : `${loop.loop}/`
  const merged = loop.iterations.filter((i) => i.merged).length
  const failed = loop.iterations.filter((i) => i.failed).length
  return (
    <section style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '8px 0' }}>
        Parallel loop in step {loop.loop}: {loop.iterations.length} iterations
        {loop.running ? ` (running: ${merged} merged, ${failed} failed)` : ' (finished)'}
      </h3>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={cell}>#</th>
            <th style={cell}>Iteration</th>
            <th style={cell}>State</th>
            {loop.running && <th style={cell}>Merged</th>}
            <th style={cell}>Output</th>
          </tr>
        </thead>
        <tbody>
          {loop.iterations.map((it) => (
            <tr key={it.name}>
              <td style={cell}>{it.number ?? ''}</td>
              <td style={cell}>{it.name}</td>
              <td style={cell}>
                <StateBadge state={it.state} />
              </td>
              {loop.running && (
                <td style={cell}>{it.failed ? 'failed' : it.merged ? 'yes' : 'not yet'}</td>
              )}
              <td style={cell}>
                <button type="button" onClick={() => onOpenFile(prefix + it.job_out)}>
                  job.out
                </button>{' '}
                <button type="button" onClick={() => onOpenFile(prefix + it.iteration_out)}>
                  iteration.out
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function StepTasks({ step }: { step: JobStepTasks }) {
  const [open, setOpen] = useState(false)
  const summary = STATES.filter((s) => step.counts[s])
    .map((s) => `${step.counts[s]} ${s}`)
    .join(', ')
  return (
    <section style={{ marginBottom: 8 }}>
      <button type="button" onClick={() => setOpen(!open)} style={{ marginRight: 8 }}>
        {open ? '▾' : '▸'}
      </button>
      <strong>Step {step.step}</strong>: {step.tasks.length} tasks{summary ? ` — ${summary}` : ''}
      {open && (
        <table style={{ borderCollapse: 'collapse', marginTop: 4, marginLeft: 24 }}>
          <thead>
            <tr>
              <th style={cell}>Task</th>
              <th style={cell}>State</th>
              <th style={cell}>Attempts</th>
              <th style={cell}>Where</th>
              <th style={cell}>Bundle</th>
              <th style={cell}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {step.tasks.map((t) => (
              <tr key={t.key}>
                <td style={cell}>{t.key}</td>
                <td style={cell}>
                  <StateBadge state={t.state} />
                </td>
                <td style={cell}>{t.attempts}</td>
                <td style={cell}>{t.backend ?? ''}</td>
                <td style={cell}>{t.bundle ?? ''}</td>
                <td style={{ ...cell, whiteSpace: 'normal' }}>{t.reason ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

// The job's tasks per step and its parallel loops' iterations. Read-only, from
// the job's files; refreshed every 15 s while the job runs (a remote job's files
// are synced first, within the backend's own throttle).
export function TasksPanel({
  jobId,
  running,
  isRemote,
  onOpenFile,
}: {
  jobId: string
  running: boolean
  isRemote: boolean
  onOpenFile: (path: string) => void
}) {
  const tasks = useQuery({
    queryKey: ['job-tasks', jobId],
    queryFn: async () => {
      if (isRemote && running) {
        try {
          await syncJobFiles(jobId)
        } catch {
          // shown as of the last sync
        }
      }
      return fetchJobTasks(jobId)
    },
    refetchInterval: running ? 15000 : false,
  })

  if (tasks.isLoading) return <p style={{ padding: 8 }}>Loading tasks…</p>
  if (tasks.isError)
    return <p style={{ padding: 8 }}>Error: {(tasks.error as Error).message}</p>
  const data = tasks.data!
  const asOf = new Date(data.as_of * 1000).toLocaleTimeString()
  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 8 }}>
      <p style={{ marginTop: 0, color: '#666' }}>
        As of {asOf}
        {isRemote ? ', from the files last synced from the cluster' : ''}
        {running ? '; refreshed every 15 s while the job runs.' : '.'}
      </p>
      {data.loops.length === 0 && data.steps.length === 0 && (
        <p>This job has no tasks or parallel loops.</p>
      )}
      {data.loops.map((loop) => (
        <LoopTable key={loop.loop} loop={loop} onOpenFile={onOpenFile} />
      ))}
      {data.steps.length > 0 && <h3 style={{ margin: '8px 0' }}>Tasks by step</h3>}
      {data.steps.map((step) => (
        <StepTasks key={step.step} step={step} />
      ))}
    </div>
  )
}
