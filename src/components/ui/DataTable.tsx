import type { Key, ReactNode } from 'react'
export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
}
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  emptyMessage = '표시할 항목이 없습니다.',
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => Key
  caption: string
  emptyMessage?: string
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-subtle text-xs text-muted">
          <tr>
            {columns.map((column) => (
              <th
                scope="col"
                key={column.key}
                className="whitespace-nowrap px-4 py-2.5 font-bold"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-t border-line">
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-3">
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={columns.length}
                className="p-8 text-center text-muted"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
