import Papa from 'papaparse'
import { DataTable } from './DataTable'

interface CsvTableProps {
  content: string
}

// Matches the old dashboard's loadTable() (job_report.js): first row as
// headers, the rest as data. Uses PapaParse rather than a naive split(',')
// since real CSV can have quoted fields containing commas.
export function CsvTable({ content }: CsvTableProps) {
  const parsed = Papa.parse<string[]>(content.trim(), { skipEmptyLines: true })

  if (parsed.errors.length > 0) {
    return (
      <p>
        Could not parse this file as CSV: {parsed.errors[0].message} (row{' '}
        {parsed.errors[0].row})
      </p>
    )
  }

  const [header, ...rows] = parsed.data

  if (!header) return <p>Empty CSV file.</p>

  return <DataTable header={header} rows={rows} />
}
