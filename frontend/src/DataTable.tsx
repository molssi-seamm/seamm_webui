interface DataTableProps {
  header: string[]
  rows: string[][]
  caption?: string
}

const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/

// A plain table of text cells, the numbers right-aligned so that columns of
// numbers line up. Shared by CSV files and LAMMPS .trj files.
export function DataTable({ header, rows, caption }: DataTableProps) {
  return (
    <div style={{ height: '100%', maxWidth: '100%', overflow: 'auto', boxSizing: 'border-box' }}>
      <table>
        {caption && (
          <caption style={{ textAlign: 'left', padding: '0 0 0.5em', fontSize: '0.95em' }}>
            {caption}
          </caption>
        )}
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th
                key={i}
                style={rows.length > 0 && NUMBER.test(rows[0][i] ?? '') ? { textAlign: 'right' } : undefined}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  style={NUMBER.test(cell) ? { textAlign: 'right', fontFamily: 'monospace' } : undefined}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
