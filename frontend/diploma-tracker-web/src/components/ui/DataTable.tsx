import type { HTMLAttributes, ReactNode } from 'react'
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
  // O3 fix (task-6 review I1): some rows are listed but not openable (a "No steps" row, or a row
  // whose current step the caller cannot actually open) - lets a page opt specific rows out of
  // both the click handler and the pointer-cursor/hover styling, instead of every row getting
  // clickable styling just because onRowClick is set at all. Rows are clickable by default
  // whenever onRowClick is given.
  isRowClickable?: (row: T) => boolean
  // Task 16, step 5: lets a page (e.g. drag-to-reorder steps) attach native attributes such as
  // `draggable`/`onDragStart` to a row without every other DataTable caller having to know about it.
  rowProps?: (row: T) => HTMLAttributes<HTMLTableRowElement>
}

export function DataTable<T>({ columns, rows, getRowKey, loading = false, emptyState, onRowClick, isRowClickable, rowProps }: DataTableProps<T>) {
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
          {rows.map((row) => {
            const clickable = Boolean(onRowClick) && (isRowClickable ? isRowClickable(row) : true)
            return (
              <tr
                key={getRowKey(row)}
                {...rowProps?.(row)}
                onClick={clickable ? () => onRowClick!(row) : undefined}
                className={cn('border-b border-border-subtle/60 last:border-0', clickable && 'cursor-pointer hover:bg-surface')}
              >
                {columns.map((column) => (
                  <td key={column.key} className={cn('px-3 py-2.5 align-middle text-text-strong', column.className)}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
