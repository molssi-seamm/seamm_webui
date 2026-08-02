import { lazy, Suspense, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchJob, fetchJobFiles, fetchJobFileContent, jobFileDownloadUrl } from '../api'
import { buildTree, TreeView } from '../FileTree'
import { ResizableSplit } from '../ResizableSplit'

// Lazy-loaded: NGL pulls in three.js and adds well over 1MB to the bundle.
// Loading it eagerly would undercut the entire point of this rewrite
// (performance) for every user, even those who never open a structure file.
const StructureViewer = lazy(() =>
  import('../StructureViewer').then((m) => ({ default: m.StructureViewer })),
)

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

// File-content viewer: tree on the left, content on the right, matching the
// old dashboard's two-pane layout (its job_report.js). Plain text/logs and
// 3D structures (cif/mmcif/pdb/sdf, via NGL) are covered -- the old
// dashboard's other per-file-type renderers (CSV -> table, .graph -> Plotly,
// .flow -> flowchart diagram) are a deliberate, separate follow-up.
function FileViewer({ jobId }: { jobId: string }) {
  const [selected, setSelected] = useState<string | null>(null)

  const files = useQuery({
    queryKey: ['job-files', jobId],
    queryFn: () => fetchJobFiles(jobId),
  })

  const selectedExt = selected ? getExtension(selected) : null
  const isStructure = !!selectedExt && STRUCTURE_EXTENSIONS.has(selectedExt)

  const content = useQuery({
    queryKey: ['job-file-content', jobId, selected],
    queryFn: () => fetchJobFileContent(jobId, selected!),
    enabled: !!selected && !isStructure,
  })

  if (files.isLoading) return <p>Loading files…</p>
  if (files.error) return <p>Error loading files: {(files.error as Error).message}</p>
  if (!files.data) return null

  const tree = buildTree(files.data)
  const selectedFile = files.data.find((f) => f.path === selected)

  return (
    <ResizableSplit
      left={
        <div
          style={{
            maxHeight: '75vh',
            overflow: 'auto',
            border: '1px solid var(--border)',
            padding: '0.5em',
          }}
        >
          <TreeView nodes={tree} selected={selected} onSelect={setSelected} />
        </div>
      }
      right={
        <>
          {!selected && <p>Select a file to view its contents.</p>}
          {selected && (
            <>
              <p>
                <strong>{selected}</strong>
                {selectedFile && <> ({formatSize(selectedFile.size)})</>} —{' '}
                <a href={jobFileDownloadUrl(jobId, selected)}>Download</a>
              </p>
              {isStructure && selectedExt && (
                <Suspense fallback={<p>Loading structure viewer…</p>}>
                  <StructureViewer
                    key={selected}
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
                  {content.data && content.data.content !== null && (
                    <pre
                      style={{
                        maxHeight: '75vh',
                        overflow: 'auto',
                        border: '1px solid var(--border)',
                        padding: '0.5em',
                      }}
                    >
                      {content.data.content}
                    </pre>
                  )}
                </>
              )}
            </>
          )}
        </>
      }
    />
  )
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()

  const job = useQuery({
    queryKey: ['job', id],
    queryFn: () => fetchJob(id!),
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
      {id && <FileViewer jobId={id} />}
    </div>
  )
}
