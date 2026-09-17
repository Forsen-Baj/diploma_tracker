import type { ReactNode } from 'react'
import { cn } from './cn'
import { Spinner } from './Spinner'

export type DataTableColumn<T> = {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  className?: string
}

type DataTableProps<T> = {
  columns: DataTableColumn<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  loading?: boolean
  emptyState?: ReactNode
  onRowClick?: (row: T) => void
}

export function DataTable<T>({ columns, rows, getRowKey, loading = false, emptyState, onRowClick }: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  if (rows.length === 0) {
    return <>{emptyState}</>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-subtle">
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cn('px-3 py-2 text-left text-xs font-semibold text-heading', column.className)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn('border-b border-border-subtle/60 last:border-0', onRowClick && 'cursor-pointer hover:bg-surface')}
            >
              {columns.map((column) => (
                <td key={column.key} className={cn('px-3 py-2.5 align-middle text-text-strong', column.className)}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
