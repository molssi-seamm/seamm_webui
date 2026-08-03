import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  getCoreRowModel,
  useReactTable,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import { fetchJobs, fetchProjects, type Job } from '../api'

const MIN_PAGE_SIZE = 5
const DEFAULT_PAGE_SIZE = 15
// Reserve room below the table for the pagination row (and its margin) when
// working out how many job rows actually fit on screen.
const PAGINATION_RESERVE_PX = 56

const columnHelper = createColumnHelper<Job>()
const columns = [
  columnHelper.accessor('id', { header: 'ID' }),
  columnHelper.accessor('title', {
    header: 'Title',
    cell: (info) => <Link to={`/jobs/${info.row.original.id}`}>{info.getValue()}</Link>,
  }),
  columnHelper.accessor('status', { header: 'Status' }),
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

  const projects = useQuery({ queryKey: ['projects'], queryFn: fetchProjects })

  const { data, isLoading, error } = useQuery({
    queryKey: ['jobs', page, project, pageSize],
    queryFn: () => fetchJobs(page * pageSize, pageSize, project || undefined),
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
