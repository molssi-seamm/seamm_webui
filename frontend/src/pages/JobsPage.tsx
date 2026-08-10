import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCoreRowModel,
  useReactTable,
  flexRender,
  createColumnHelper,
  type RowSelectionState,
} from '@tanstack/react-table'
import { deleteJobs, fetchJobs, fetchProjects, killJobs, type Job } from '../api'

const MIN_PAGE_SIZE = 5
const DEFAULT_PAGE_SIZE = 15
// Reserve room below the table for the pagination row (and its margin) when
// working out how many job rows actually fit on screen.
const PAGINATION_RESERVE_PX = 56

const columnHelper = createColumnHelper<Job>()
const columns = [
  columnHelper.display({
    id: 'select',
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
  }),
  columnHelper.accessor('id', { header: 'ID' }),
  columnHelper.accessor('title', {
    header: 'Title',
    cell: (info) => <Link to={`/jobs/${info.row.original.id}`}>{info.getValue()}</Link>,
  }),
  columnHelper.accessor('status', { header: 'Status' }),
  columnHelper.accessor((row) => row.parameters.queue, {
    id: 'queue',
    header: 'Queue',
    cell: (info) => {
      const queue = info.getValue()
      return typeof queue === 'string' ? queue : '—'
    },
  }),
  columnHelper.accessor('submitted', { header: 'Submitted' }),
  columnHelper.accessor('finished', { header: 'Finished' }),
]

// Server-side-paginated job list (offset/limit passed straight through to
// Job.get() -- see seamm_webui/routers/jobs.py). This is the fix for the
// old dashboard's "fetch every job at once" problem; don't let a future
// change revert to fetching everything client-side.
//
// Page number and project filter live in the URL's search params (not
// useState) so that the browser back button -- and the JobDetailPage "back
// to jobs" link, which just calls navigate(-1) -- lands back on the exact
// list view the user came from, instead of always resetting to page 1 /
// "All projects".
export function JobsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Number(searchParams.get('page') ?? '0')
  const project = searchParams.get('project') ?? ''

  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const containerRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  // Keyed by job id (not row index -- see getRowId below), so a selection
  // made on one page survives navigating to another page/filter and back;
  // "select all" only ever affects the currently visible page's rows
  // (table.getIsAllPageRowsSelected/getToggleAllPageRowsSelectedHandler),
  // which is the right scope since that's all the data actually loaded.
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [confirmKillSelected, setConfirmKillSelected] = useState(false)
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [bulkResultMessage, setBulkResultMessage] = useState<string | null>(null)

  const projects = useQuery({ queryKey: ['projects'], queryFn: fetchProjects })

  const { data, isLoading, error } = useQuery({
    queryKey: ['jobs', page, project, pageSize],
    queryFn: () => fetchJobs(page * pageSize, pageSize, project || undefined),
  })

  const selectedIds = Object.keys(rowSelection).map(Number)

  function clearSelectionAndRefresh() {
    setRowSelection({})
    setConfirmKillSelected(false)
    setConfirmDeleteSelected(false)
    setDeleteConfirmText('')
    queryClient.invalidateQueries({ queryKey: ['jobs'] })
  }

  const killSelectedMutation = useMutation({
    mutationFn: () => killJobs(selectedIds),
    onSuccess: (result) => {
      setBulkResultMessage(
        `Killed ${result.killed.length} job(s)` +
          (result.skipped.length
            ? `; skipped ${result.skipped.length} already-finished job(s)`
            : ''),
      )
      clearSelectionAndRefresh()
    },
  })

  const deleteSelectedMutation = useMutation({
    mutationFn: () => deleteJobs(selectedIds),
    onSuccess: (result) => {
      setBulkResultMessage(`Deleted ${result.deleted.length} job(s)`)
      clearSelectionAndRefresh()
    },
  })

  // Size the page to however many rows actually fit between the table and
  // the bottom of the browser window, instead of a fixed 10 rows that
  // leaves empty space on a tall screen (or forces scrolling on a short
  // one). Recomputed on resize and whenever new rows render, since that's
  // the only reliable way to know the real row height.
  useEffect(() => {
    function recompute() {
      const el = containerRef.current
      if (!el) return
      const headerRow = el.querySelector('thead tr')
      const bodyRow = el.querySelector('tbody tr')
      const rowHeight = (bodyRow ?? headerRow)?.getBoundingClientRect().height
      const headerHeight = headerRow?.getBoundingClientRect().height ?? rowHeight
      if (!rowHeight || !headerHeight) return

      const top = el.getBoundingClientRect().top
      const available = window.innerHeight - top - headerHeight - PAGINATION_RESERVE_PX
      const rows = Math.max(MIN_PAGE_SIZE, Math.floor(available / rowHeight))

      setPageSize((prev) => (prev === rows ? prev : rows))
    }

    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [data])

  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
  })

  function goToPage(next: number) {
    const params = new URLSearchParams(searchParams)
    params.set('page', String(next))
    setSearchParams(params)
  }

  return (
    <div>
      <h2>Jobs</h2>
      <p>
        <label>
          Project{' '}
          <select
            value={project}
            onChange={(e) => {
              const params = new URLSearchParams(searchParams)
              if (e.target.value) params.set('project', e.target.value)
              else params.delete('project')
              params.set('page', '0')
              setSearchParams(params)
            }}
          >
            <option value="">All projects</option>
            {projects.data?.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          columnGap: '1em',
          margin: '0.5em 0',
          minHeight: '1.5em',
        }}
      >
        <span>{selectedIds.length} selected</span>
        {selectedIds.length > 0 && !confirmKillSelected && !confirmDeleteSelected && (
          <>
            <button onClick={() => setConfirmKillSelected(true)}>Kill selected&hellip;</button>
            <button onClick={() => setConfirmDeleteSelected(true)}>
              Delete selected&hellip;
            </button>
          </>
        )}
        {confirmKillSelected && (
          <span>
            Stop {selectedIds.length} job(s)? Already-finished ones are skipped, files are
            kept.{' '}
            <button
              onClick={() => killSelectedMutation.mutate()}
              disabled={killSelectedMutation.isPending}
            >
              {killSelectedMutation.isPending ? 'Requesting…' : 'Yes, kill selected'}
            </button>{' '}
            <button onClick={() => setConfirmKillSelected(false)}>Cancel</button>
          </span>
        )}
        {confirmDeleteSelected && (
          <span>
            Permanently delete {selectedIds.length} job(s) and their files? Type{' '}
            <strong>DELETE</strong> to confirm:{' '}
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              style={{ width: '6em' }}
            />{' '}
            <button
              onClick={() => deleteSelectedMutation.mutate()}
              disabled={deleteConfirmText !== 'DELETE' || deleteSelectedMutation.isPending}
            >
              {deleteSelectedMutation.isPending ? 'Deleting…' : 'Permanently delete'}
            </button>{' '}
            <button
              onClick={() => {
                setConfirmDeleteSelected(false)
                setDeleteConfirmText('')
              }}
            >
              Cancel
            </button>
          </span>
        )}
        {bulkResultMessage && <span>{bulkResultMessage}</span>}
      </div>
      {killSelectedMutation.isError && (
        <p>Error: {(killSelectedMutation.error as Error).message}</p>
      )}
      {deleteSelectedMutation.isError && (
        <p>Error: {(deleteSelectedMutation.error as Error).message}</p>
      )}

      {isLoading && <p>Loading jobs…</p>}
      {error && <p>Error loading jobs: {(error as Error).message}</p>}

      {data && (
        <div ref={containerRef}>
          <table style={{ width: '100%' }}>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: '1em' }}>
            <button onClick={() => goToPage(Math.max(0, page - 1))} disabled={page === 0}>
              Previous
            </button>
            <span style={{ margin: '0 1em' }}>Page {page + 1}</span>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={(data?.length ?? 0) < pageSize}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
