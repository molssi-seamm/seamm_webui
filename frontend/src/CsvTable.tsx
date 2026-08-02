import Papa from 'papaparse'

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

  return (
    <div style={{ maxHeight: '75vh', maxWidth: '100%', overflow: 'auto' }}>
      <table>
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th key={i}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
