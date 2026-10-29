import { getTableColumns, type Table } from 'drizzle-orm'

const D1_MAX_PARAMETERS = 100

export function insertChunks<T>(table: Table, rows: T[]): T[][] {
  const size = Math.floor(D1_MAX_PARAMETERS / Object.keys(getTableColumns(table)).length)
  const chunks: T[][] = []
  for (let start = 0; start < rows.length; start += size) {
    chunks.push(rows.slice(start, start + size))
  }
  return chunks
}
