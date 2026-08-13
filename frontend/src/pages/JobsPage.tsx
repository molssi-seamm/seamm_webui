import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCoreRowModel,
  useReactTable,
  flexRender,
  createColumnHelper,
  type RowSelectionState,
} from '@tanstack/react-table'
import { deleteJobs, fetchJobs, fetchProjects, fetchQueues, killJobs, type Job } from '../api'
import { ColumnFilter, FilterOptionList } from '../ColumnFilter'
import { SkipToStartIcon, SkipToEndIcon, PrevIcon, NextIcon } from '../icons'

const MIN_PAGE_SIZE = 5
const DEFAULT_PAGE_SIZE = 15
// Reserve room below the table for the pagination row (and its margin) when
// working out how many job rows actually fit on screen.
const PAGINATION_RESERVE_PX = 56

// The closed set of statuses a Job's `status` column actually takes on
// (seamm_jobserver/seamm_datastore) -- genuinely enum-like, unlike title,
// so a picklist rather than a search box. Not fetched from the backend;
// there's no endpoint for it and this set changes about as often as the
// status column itself does.
const STATUSES = [
  'submitted',
  'running',
  'finished',
  'error',
  'failed',
  'kill',
  'killed',
  'imported',
]

// How long to wait after the user stops typing in the title filter before
// updating the URL (and thus firing the request) -- avoids a request per
// keystroke while still feeling "live."
const TITLE_FILTER_DEBOUNCE_MS = 400

const columnHelper = createColumnHelper<Job>()

// Server-side-paginated job list (offset/limit passed straight through to
// Job.get() -- see seamm_webui/routers/jobs.py). This is the fix for the
// old dashboard's "fetch every job at once" problem; don't let a future
// change revert to fetching everything client-side.
//
// Page number and every filter live in the URL's search params (not
// useState) so that the browser back button -- and the JobDetailPage "back
// to jobs" link, which just calls navigate(-1) -- lands back on the exact
// list view the user came from, instead of always resetting to page 1 /
// unfiltered.
//
// Filters live in the column headers themselves (Excel-style click-a-
// funnel-icon popovers, ColumnFilter.tsx) rather than a separate widget
// row above the table -- Project included, even though it isn't otherwise
// a very "columnar" property of a job, so every filter is discoverable the
// same way instead of Project being the odd one out in a row of its own.
export function JobsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Number(searchParams.get('page') ?? '0')
  const project = searchParams.get('project') ?? ''
  const status = searchParams.get('status') ?? ''
  const title = searchParams.get('title') ?? ''
  const queue = searchParams.get('queue') ?? ''

  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const containerRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  // Which column's filter popover is open, if any -- only one at a time.
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  function toggleFilter(name: string) {
    setOpenFilter((cur) => (cur === name ? null : name))
  }
  const closeFilter = () => setOpenFilter(null)

  // Debounced text filter: typing updates this local draft immediately
  // (so the input feels responsive), and only pushes to the URL -- which
  // is what actually drives the query -- after the user pauses. Also
  // stays in sync when `title` changes from outside typing (URL edited
  // directly, browser back/forward), without re-triggering its own push.
  const [titleDraft, setTitleDraft] = useState(title)
  useEffect(() => {
    setTitleDraft(title)
  }, [title])
  useEffect(() => {
    if (titleDraft === title) return
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams)
      if (titleDraft) params.set('title', titleDraft)
      else params.delete('title')
      params.set('page', '0')
      setSearchParams(params, { replace: true })
    }, TITLE_FILTER_DEBOUNCE_MS)
    return () => clearTimeout(handle)
    // Deliberately keyed on titleDraft alone -- searchParams/title/
    // setSearchParams would all re-fire this on every render (they're new
    // references or already handled by the early-return above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleDraft])

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
  const queues = useQuery({ queryKey: ['queues'], queryFn: fetchQueues })

  const { data, isLoading, error } = useQuery({
    queryKey: ['jobs', page, project, status, title, queue, pageSize],
    queryFn: () =>
      fetchJobs(page * pageSize, pageSize, {
        project: project || undefined,
        status: status || undefined,
        title: title || undefined,
        queue: queue || undefined,
      }),
  })
  const jobs = data?.jobs ?? []
  // null if the backend didn't send X-Total-Count (see fetchJobs) --
  // First/Last then fall back to "just disable Last, First still works."
  const lastPageIndex =
    data?.total != null ? Math.max(0, Math.ceil(data.total / pageSize) - 1) : null

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
  // one).
  //
  // Measured once, the first time the table actually has rows to measure
  // (before that, containerRef isn't mounted at all -- the ref'd <div>
  // only renders once `data` exists), and otherwise only on a real window
  // resize -- deliberately NOT on every later page's `data` change.
  // getBoundingClientRect() returns sub-pixel heights that jitter by a
  // fraction of a pixel between renders even for visually-identical rows
  // (confirmed empirically: 65.1875px vs 65.6875px on the same page, same
  // styling) -- re-measuring after every page load fed that jitter back
  // into Math.floor(available / rowHeight), which occasionally landed on a
  // different pageSize between two pages, triggering a refetch with the
  // new limit, which is itself a `data` change that re-ran this same
  // effect -- a resize<->refetch loop that reads as fast flicker, worse
  // the taller (more rows-per-page) the window is, since more rows summed
  // through that fraction-of-a-pixel error makes the floor() boundary
  // easier to cross. Measuring once removes the retrigger mechanism
  // entirely, regardless of the jitter's exact cause.
  const recomputePageSize = useCallback(() => {
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
  }, [])

  const hasMeasured = useRef(false)
  useEffect(() => {
    if (hasMeasured.current || !data) return
    hasMeasured.current = true
    recomputePageSize()
  }, [data, recomputePageSize])

  useEffect(() => {
    window.addEventListener('resize', recomputePageSize)
    return () => window.removeEventListener('resize', recomputePageSize)
  }, [recomputePageSize])

  // Shared by the Project/Status/Queue header filters: set or clear a
  // filter param, reset to page 0, and close the popover that triggered it
  // -- one click both picks the value and dismisses it.
  function applyFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams)
    if (value) params.set(key, value)
    else params.delete(key)
    params.set('page', '0')
    setSearchParams(params)
    closeFilter()
  }

  const columns = useMemo(
    () => [
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
        header: () => (
          <ColumnFilter
            label="Title"
            active={!!title}
            open={openFilter === 'title'}
            onToggle={() => toggleFilter('title')}
            onClose={closeFilter}
          >
            <input
              type="search"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              placeholder="Search titles…"
              autoFocus
            />
          </ColumnFilter>
        ),
        cell: (info) => (
          <Link
            to={`/jobs/${info.row.original.id}`}
            title={info.getValue()}
            className="cell-truncate"
            style={{ maxWidth: '38em' }}
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor((row) => row.projects.map((p) => p.name).join(', '), {
        id: 'project',
        header: () => (
          <ColumnFilter
            label="Project"
            active={!!project}
            open={openFilter === 'project'}
            onToggle={() => toggleFilter('project')}
            onClose={closeFilter}
          >
            <FilterOptionList
              allLabel="All projects"
              value={project}
              options={projects.data?.map((p) => p.name) ?? []}
              onSelect={(v) => applyFilter('project', v)}
            />
          </ColumnFilter>
        ),
        cell: (info) => (
          <span className="cell-truncate" title={info.getValue()} style={{ maxWidth: '12em' }}>
            {info.getValue() || '—'}
          </span>
        ),
      }),
      columnHelper.accessor('status', {
        header: () => (
          <ColumnFilter
            label="Status"
            active={!!status}
            open={openFilter === 'status'}
            onToggle={() => toggleFilter('status')}
            onClose={closeFilter}
          >
            <FilterOptionList
              allLabel="All statuses"
              value={status}
              options={STATUSES}
              onSelect={(v) => applyFilter('status', v)}
            />
          </ColumnFilter>
        ),
      }),
      columnHelper.accessor((row) => row.parameters.queue, {
        id: 'queue',
        header: () =>
          queues.data && queues.data.length > 0 ? (
            <ColumnFilter
              label="Queue"
              active={!!queue}
              open={openFilter === 'queue'}
              onToggle={() => toggleFilter('queue')}
              onClose={closeFilter}
            >
              <FilterOptionList
                allLabel="All queues"
                value={queue}
                options={queues.data.map((q) => q.name)}
                onSelect={(v) => applyFilter('queue', v)}
              />
            </ColumnFilter>
          ) : (
            'Queue'
          ),
        cell: (info) => {
          const value = info.getValue()
          return typeof value === 'string' ? value : '—'
        },
      }),
      columnHelper.accessor('submitted', { header: 'Submitted' }),
      columnHelper.accessor('finished', { header: 'Finished' }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openFilter, title, titleDraft, project, status, queue, projects.data, queues.data],
  )

  const table = useReactTable({
    data: jobs,
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
          <div style={{ marginTop: '1em', display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => goToPage(0)}
              disabled={page === 0}
              title="First page"
              aria-label="First page"
              className="pager-btn"
            >
              <SkipToStartIcon className="pager-icon" />
            </button>
            <button
              onClick={() => goToPage(Math.max(0, page - 1))}
              disabled={page === 0}
              title="Previous page"
              aria-label="Previous page"
              className="pager-btn"
            >
              <PrevIcon className="pager-icon" />
            </button>
            <span style={{ margin: '0 1em' }}>
              Page {page + 1}
              {lastPageIndex !== null && ` of ${lastPageIndex + 1}`}
            </span>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={jobs.length < pageSize}
              title="Next page"
              aria-label="Next page"
              className="pager-btn"
            >
              <NextIcon className="pager-icon" />
            </button>
            <button
              onClick={() => goToPage(lastPageIndex ?? page)}
              disabled={lastPageIndex === null || page >= lastPageIndex}
              title="Last page"
              aria-label="Last page"
              className="pager-btn"
            >
              <SkipToEndIcon className="pager-icon" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
