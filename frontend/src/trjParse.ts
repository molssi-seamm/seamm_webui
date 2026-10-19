export interface ParsedTrj {
  // The metadata on the first line of SEAMM's own files, if any
  meta: Record<string, unknown> | null
  header: string[]
  rows: string[][]
  // How many lines before the first row of data: what a request for the tail
  // of the file must include to keep the header
  headerLines: number
}

// Parses a LAMMPS time series (.trj) into a table, or returns null if it is not
// one (a vector trajectory, with a block of rows per timestep).
//
// Two kinds of header:
//   SEAMM's own:  !MolSSI trajectory 2.0 {"type": ..., "dt": ..., ...}
//                 Jx Jy Jz                  (the names of the columns)
//   LAMMPS's own: # Time-averaged data for fix ...
//                 # TimeStep c_x[1] ...     (the last # line has the names)
// A first column without a name is the timestep.
export function parseTrj(text: string): ParsedTrj | null {
  const lines = text.split('\n')
  if (lines.length === 0) return null
  if (lines[0].startsWith('!MolSSI vector_trajectory')) return null

  let meta: Record<string, unknown> | null = null
  let names: string[] = []
  let i = 0
  if (lines[0].startsWith('!MolSSI')) {
    const brace = lines[0].indexOf('{')
    if (brace >= 0) {
      try {
        meta = JSON.parse(lines[0].slice(brace))
      } catch {
        meta = null
      }
    }
    names = (lines[1] ?? '').trim().split(/\s+/).filter(Boolean)
    i = 2
  } else {
    while (i < lines.length && lines[i].startsWith('#')) i++
    if (i > 0) {
      names = lines[i - 1].replace(/^#+/, '').trim().split(/\s+/).filter(Boolean)
    }
  }

  const rows = lines
    .slice(i)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => line.split(/\s+/))
  const width = rows.length > 0 ? rows[0].length : names.length
  let header = names
  if (width === names.length + 1) header = ['step', ...names]
  else if (header.length !== width) {
    header = Array.from({ length: width }, (_, k) => names[k] ?? `column ${k + 1}`)
  }
  return { meta, header, rows, headerLines: i }
}

// A one-line description of SEAMM's metadata, e.g.
// "heat flux, every 2 fs, 500000 samples".
export function describeMeta(meta: Record<string, unknown> | null): string | undefined {
  if (!meta) return undefined
  const parts: string[] = []
  if (typeof meta.type === 'string') parts.push(meta.type)
  if (meta.dt !== undefined) parts.push(`every ${meta.dt} ${meta.tunits ?? ''}`.trim())
  if (meta.nsteps !== undefined) parts.push(`${meta.nsteps} samples`)
  for (const [key, value] of Object.entries(meta)) {
    if (['type', 'dt', 'tunits', 'nsteps', 'code'].includes(key)) continue
    if (key.endsWith('units')) continue
    const unit = meta[`${key}units`]
    const shown = Array.isArray(value) ? value.join(', ') : String(value)
    parts.push(`${key}: ${shown}${typeof unit === 'string' ? ` ${unit}` : ''}`)
  }
  return parts.join(' · ')
}
