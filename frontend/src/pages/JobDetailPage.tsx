import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteJob,
  fetchJob,
  fetchJobFiles,
  fetchJobFileContent,
  fetchQueues,
  jobFileDownloadUrl,
  killJob,
  syncJobFiles,
} from '../api'
import { buildTree, TreeView } from '../FileTree'
import { ResizableSplit } from '../ResizableSplit'

// Statuses seamm_jobserver will still act on a kill request for -- matches
// the backend's own KILLABLE_STATUSES (routers/jobs.py). A job in any
// other status is either not running under a jobserver in a way that
// matters yet, or already done.
const KILLABLE_STATUSES = new Set(['submitted', 'running'])

// Lazy-loaded: NGL pulls in three.js and adds well over 1MB to the bundle,
// and Plotly is similarly heavy. Loading either eagerly would undercut the
// entire point of this rewrite (performance) for every user, even those who
// never open a structure file or a graph. CsvTable (PapaParse) is small but
// lazy-loaded too for consistency -- keeps the main bundle to just what
// every user actually needs.
const StructureViewer = lazy(() =>
  import('../StructureViewer').then((m) => ({ default: m.StructureViewer })),
)
const GraphViewer = lazy(() =>
  import('../GraphViewer').then((m) => ({ default: m.GraphViewer })),
)
const CsvTable = lazy(() => import('../CsvTable').then((m) => ({ default: m.CsvTable })))

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Extensions NGL can render as a 3D structure -- matches the old
// dashboard's contentFunctions mapping in job_report.js (loadStructure).
// "cube" (volumetric/orbital data) is a separate, more complex viewer, not
// included here.
const STRUCTURE_EXTENSIONS = new Set(['cif', 'mmcif', 'pdb', 'sdf'])

function getExtension(path: string): string {
  const idx = path.lastIndexOf('.')
  return idx === -1 ? '' : path.slice(idx + 1).toLowerCase()
}

// Not a real file path -- picking it selects the "Description" pseudo-entry
// so the job description renders in the same main-viewport pane a file's
// contents would, instead of taking up a row in the metadata block above.
const DESCRIPTION_SENTINEL = ' description'

// File-content viewer: tree on the left, content on the right, matching the
// old dashboard's two-pane layout (its job_report.js). Plain text/logs, 3D
// structures (cif/mmcif/pdb/sdf, via NGL), CSV (-> table), and .graph
// (-> Plotly) are covered -- only .flow -> flowchart-diagram rendering
// remains a deliberate, separate follow-up.
//
// `selected` is lifted up to JobDetailPage (rather than owned here) so the
// header's Description button can point this pane at the description text
// the same way clicking a tree entry points it at a file.
//
// Fills 100% of its allotted height (set by the JobDetailPage flex layout,
// which itself is pinned to the viewport height) rather than a fixed vh
// value, so the whole page never scrolls -- only the tree on the left and
// the content on the right scroll independently, and the structure/graph
// viewers are sized to fit rather than overflowing.
function FileViewer({
  jobId,
  description,
  selected,
  onSelect,
  isRemote,
}: {
  jobId: string
  description: string
  selected: string | null
  onSelect: (path: string) => void
  // True once we know this job is routed to a transport=ssh queue (see
  // JobDetailPage) -- gates the auto-sync-on-open below and the "syncing
  // from cluster" note, purely to skip an unnecessary request for the
  // (much more common) local-job case. The backend endpoint itself is
  // safe to call unconditionally -- it no-ops for anything not remote --
  // so this is an optimization, not a correctness requirement.
  isRemote: boolean
}) {
  const files = useQuery({
    queryKey: ['job-files', jobId],
    queryFn: () => fetchJobFiles(jobId),
  })

  // Pulls a still-running remote job's files back on demand (see
  // routers/jobs.py's sync_job_files -- reuses the same seamm_slurm.stage
  // machinery seamm_jobserver itself uses at job-terminal time, just
  // triggered here instead of waiting for the job to finish). Fired once
  // when we learn the job is remote (below) and again from the manual
  // Refresh button -- both paths only refetch the file tree/content if a
  // real sync happened (`synced: true`), so a local job's Refresh button
  // behaves exactly as it did before this existed.
  const syncMutation = useMutation({ mutationFn: () => syncJobFiles(jobId) })

  useEffect(() => {
    if (!isRemote) return
    syncMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.synced) files.refetch()
      },
    })
    // Only re-run if the job (or its remote-ness) changes -- not on every
    // render, and not keyed to `files`/`syncMutation` themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, isRemote])

  const isDescription = selected === DESCRIPTION_SENTINEL
  const selectedExt = selected && !isDescription ? getExtension(selected) : null
  const isStructure = !!selectedExt && STRUCTURE_EXTENSIONS.has(selectedExt)
  const isCsv = selectedExt === 'csv'
  const isGraph = selectedExt === 'graph'

  const content = useQuery({
    queryKey: ['job-file-content', jobId, selected],
    queryFn: () => fetchJobFileContent(jobId, selected!),
    enabled: !!selected && !isDescription && !isStructure,
  })

  // Structures load straight from the download URL inside StructureViewer,
  // not through react-query, so there's nothing there to refetch --
  // instead bump a key to force it to remount and re-fetch the file itself.
  const [structureRefreshKey, setStructureRefreshKey] = useState(0)
  const isRefreshing = content.isFetching || files.isFetching || syncMutation.isPending

  // For a remote job, pull its files back first (synchronously, from this
  // button's point of view) before refetching -- for a local job,
  // syncJobFiles no-ops quickly and this behaves exactly as it always
  // did. Always refetches afterward regardless of whether the sync itself
  // found anything new, matching the button's prior (pre-sync) behavior.
  function handleRefresh() {
    if (isRemote) {
      syncMutation.mutate(undefined, {
        onSettled: () => {
          files.refetch()
          content.refetch()
          setStructureRefreshKey((k) => k + 1)
        },
      })
    } else {
      files.refetch()
      content.refetch()
      setStructureRefreshKey((k) => k + 1)
    }
  }

  if (files.isLoading) return <p>Loading files…</p>
  if (files.error) return <p>Error loading files: {(files.error as Error).message}</p>
  if (!files.data) return null

  const tree = buildTree(files.data)
  const selectedFile = isDescription ? undefined : files.data.find((f) => f.path === selected)

  return (
    <ResizableSplit
      left={
        <div
          style={{
            height: '100%',
            overflow: 'auto',
            border: '1px solid var(--border)',
            padding: '0.5em',
            boxSizing: 'border-box',
          }}
        >
          <TreeView nodes={tree} selected={isDescription ? null : selected} onSelect={onSelect} />
        </div>
      }
      right={
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {!selected && <p>Select a file to view its contents.</p>}
          {isDescription && (
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <h3 style={{ marginTop: 0 }}>Description</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{description}</p>
            </div>
          )}
          {selected && !isDescription && (
            <>
              <p style={{ flexShrink: 0 }}>
                <strong>{selected}</strong>
                {selectedFile && <> ({formatSize(selectedFile.size)})</>} —{' '}
                <a href={jobFileDownloadUrl(jobId, selected)}>Download</a> —{' '}
                <button onClick={handleRefresh} disabled={isRefreshing}>
                  {isRefreshing ? 'Refreshing…' : 'Refresh'}
                </button>
              </p>
              <div style={{ flex: 1, minHeight: 0 }}>
                {isStructure && selectedExt && (
                  <Suspense fallback={<p>Loading structure viewer…</p>}>
                    <StructureViewer
                      key={`${selected}-${structureRefreshKey}`}
                      url={jobFileDownloadUrl(jobId, selected)}
                      ext={selectedExt}
                    />
                  </Suspense>
                )}
                {!isStructure && (
                  <>
                    {content.isLoading && <p>Loading…</p>}
                    {content.error && <p>Error: {(content.error as Error).message}</p>}
                    {content.data && content.data.reason === 'binary' && (
                      <p>Binary file — cannot preview. Use the download link above.</p>
                    )}
                    {content.data && content.data.reason === 'too_large' && (
                      <p>
                        File too large to preview ({formatSize(content.data.size)}). Use
                        the download link above.
                      </p>
                    )}
                    {content.data && content.data.content !== null && isCsv && (
                      <Suspense fallback={<p>Loading table…</p>}>
                        <CsvTable content={content.data.content} />
                      </Suspense>
                    )}
                    {content.data && content.data.content !== null && isGraph && (
                      <Suspense fallback={<p>Loading graph…</p>}>
                        <GraphViewer content={content.data.content} />
                      </Suspense>
                    )}
                    {content.data &&
                      content.data.content !== null &&
                      !isCsv &&
                      !isGraph && (
                        <pre
                          style={{
                            height: '100%',
                            margin: 0,
                            overflow: 'auto',
                            border: '1px solid var(--border)',
                            padding: '0.5em',
                            boxSizing: 'border-box',
                          }}
                        >
                          {content.data.content}
                        </pre>
                      )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      }
    />
  )
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  // react-router gives the initial history entry (e.g. a direct link/reload
  // straight to /jobs/:id) key "default" -- there's nothing to go back to
  // in that case, so fall back to a plain link to the list root instead of
  // navigating out of the app.
  const location = useLocation()
  const canGoBack = location.key !== 'default'
  const [selected, setSelected] = useState<string | null>(null)
  const [confirmKill, setConfirmKill] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmJobId, setConfirmJobId] = useState('')
  const queryClient = useQueryClient()

  const job = useQuery({
    queryKey: ['job', id],
    queryFn: () => fetchJob(id!),
    enabled: !!id,
  })

  // Only used to look up whether this job's queue is transport=ssh
  // (QueueInfo.remote) -- host/remote_root themselves are never exposed.
  // See FileViewer's isRemote prop for what this gates.
  const queues = useQuery({ queryKey: ['queues'], queryFn: fetchQueues })
  const jobQueue = typeof job.data?.parameters.queue === 'string' ? job.data.parameters.queue : null
  const isRemote = !!jobQueue && !!queues.data?.find((q) => q.name === jobQueue)?.remote

  const killMutation = useMutation({
    mutationFn: () => killJob(id!),
    onSuccess: (updated) => {
      queryClient.setQueryData(['job', id], updated)
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      setConfirmKill(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteJob(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      // Same "go back to wherever the list was" behavior as the back
      // link above -- the job is gone, there's nothing to show here now.
      if (canGoBack) navigate(-1)
      else navigate('/')
    },
  })

  if (job.isLoading) return <p>Loading job…</p>
  if (job.error) return <p>Error loading job: {(job.error as Error).message}</p>
  if (!job.data) return null

  const j = job.data

  return (
    // Fills 100% of .app-content's height (a definite value, via the
    // .app-shell/.app-main flex chain in index.css) rather than 100svh --
    // this page must never scroll itself; only the panes below (file tree,
    // file content) do. Using the viewport height directly would overflow
    // below the fold now that the sidebar/top bar also share that height.
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxSizing: 'border-box',
        paddingBottom: '1em',
      }}
    >
      <div style={{ flexShrink: 0 }}>
        <p style={{ margin: '1em 0 0' }}>
          {canGoBack ? (
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault()
                navigate(-1)
              }}
            >
              &larr; Back to jobs
            </a>
          ) : (
            <Link to="/">&larr; Back to jobs</Link>
          )}
        </p>
        <h2>
          Job {j.id}: {j.title}
        </h2>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            columnGap: '2em',
            rowGap: '0.25em',
            margin: '0.5em 0 1em',
            fontSize: '0.95em',
            alignItems: 'baseline',
          }}
        >
          <span>
            <strong>Status:</strong> {j.status}
            {j.status === 'kill' && ' (stop requested, waiting for the jobserver)'}
          </span>
          <span>
            <strong>Projects:</strong> {j.projects.map((p) => p.name).join(', ') || '—'}
          </span>
          {typeof j.parameters.queue === 'string' && (
            <span>
              <strong>Queue:</strong> {j.parameters.queue}
              {isRemote && (
                <span
                  title="This job runs on a remote cluster with no shared filesystem -- its files are pulled back on demand while opening this page or clicking a file's Refresh button."
                  style={{ marginLeft: '0.5em', opacity: 0.75 }}
                >
                  (remote — files sync automatically)
                </span>
              )}
            </span>
          )}
          <span>
            <strong>Submitted:</strong> {j.submitted ?? '—'}
          </span>
          <span>
            <strong>Started:</strong> {j.started ?? '—'}
          </span>
          <span>
            <strong>Finished:</strong> {j.finished ?? '—'}
          </span>
          {j.description.trim() && (
            <button onClick={() => setSelected(DESCRIPTION_SENTINEL)}>Description</button>
          )}
          {KILLABLE_STATUSES.has(j.status) && !confirmKill && (
            <button onClick={() => setConfirmKill(true)}>Kill job&hellip;</button>
          )}
          {confirmKill && (
            <span>
              Stop this job? Its files are kept (unlike deleting its project).{' '}
              <button onClick={() => killMutation.mutate()} disabled={killMutation.isPending}>
                {killMutation.isPending ? 'Requesting…' : 'Yes, kill it'}
              </button>{' '}
              <button onClick={() => setConfirmKill(false)}>Cancel</button>
            </span>
          )}
          {!confirmDelete && (
            <button onClick={() => setConfirmDelete(true)}>Delete job&hellip;</button>
          )}
        </div>
        {killMutation.isError && <p>Error: {(killMutation.error as Error).message}</p>}
        {confirmDelete && (
          <p style={{ fontSize: '0.95em' }}>
            Permanently delete this job and its files
            {KILLABLE_STATUSES.has(j.status) && (
              <>
                {' '}
                (it's still <strong>{j.status}</strong> — deleting it will also stop it)
              </>
            )}
            ? Type the job ID (<strong>{j.id}</strong>) to confirm:{' '}
            <input
              type="text"
              value={confirmJobId}
              onChange={(e) => setConfirmJobId(e.target.value)}
              style={{ width: '5em' }}
            />{' '}
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={confirmJobId !== String(j.id) || deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Permanently delete'}
            </button>{' '}
            <button
              type="button"
              onClick={() => {
                setConfirmDelete(false)
                setConfirmJobId('')
              }}
            >
              Cancel
            </button>
            {deleteMutation.isError && <> Error: {(deleteMutation.error as Error).message}</>}
          </p>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {id && (
          <FileViewer
            jobId={id}
            description={j.description}
            selected={selected}
            onSelect={setSelected}
            isRemote={isRemote}
          />
        )}
      </div>
    </div>
  )
}
