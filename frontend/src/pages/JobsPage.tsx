import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getCoreRowModel,
  useReactTable,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import { fetchJobs, type Job } from '../api'

const PAGE_SIZE = 10

const columnHelper = createColumnHelper<Job>()
const columns = [
  columnHelper.accessor('id', { header: 'ID' }),
  columnHelper.accessor('title', { header: 'Title' }),
  columnHelper.accessor('status', { header: 'Status' }),
  columnHelper.accessor('submitted', { header: 'Submitted' }),
  columnHelper.accessor('finished', { header: 'Finished' }),
]

// Phase 1 placeholder page: proves the frontend can reach the FastAPI
// backend with real, server-side-paginated data (offset/limit passed
// straight through to Job.get() -- see seamm_webui/routers/jobs.py). This
// is the fix for the old dashboard's "fetch every job at once" problem;
// don't let a future page revert to fetching everything client-side.
export function JobsPage() {
  const [page, setPage] = useState(0)

  const { data, isLoading, error } = useQuery({
    queryKey: ['jobs', page],
    queryFn: () => fetchJobs(page * PAGE_SIZE, PAGE_SIZE),
  })

  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) return <p>Loading jobs…</p>
  if (error) return <p>Error loading jobs: {(error as Error).message}</p>

  return (
    <div>
      <h2>Jobs</h2>
      <table>
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
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
          Previous
        </button>
        <span style={{ margin: '0 1em' }}>Page {page + 1}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={(data?.length ?? 0) < PAGE_SIZE}
        >
          Next
        </button>
      </div>
    </div>
  )
}
