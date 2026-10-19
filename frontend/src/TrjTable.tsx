import { DataTable } from './DataTable'
import { describeMeta, type ParsedTrj } from './trjParse'

interface TrjTableProps {
  parsed: ParsedTrj
}

export function TrjTable({ parsed }: TrjTableProps) {
  return <DataTable header={parsed.header} rows={parsed.rows} caption={describeMeta(parsed.meta)} />
}
