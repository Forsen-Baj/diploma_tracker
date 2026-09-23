import type { DashboardGroupRow } from '../../api/types'

export type GroupSortKey =
  | 'code'
  | 'department'
  | 'students'
  | 'approvedTopics'
  | 'stepsApproved'
  | 'waiting'
  | 'late'
  | 'overdue'

export type GroupSort = {
  key: GroupSortKey
  direction: 'asc' | 'desc'
}

// A header click on the already-active column reverses direction; a click on a new column
// starts it ascending.
export function nextGroupSort(current: GroupSort, key: GroupSortKey): GroupSort {
  if (current.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  }
  return { key, direction: 'asc' }
}

function compareGroupRows(a: DashboardGroupRow, b: DashboardGroupRow, key: GroupSortKey): number {
  switch (key) {
    case 'code':
      return a.groupCode.localeCompare(b.groupCode) || a.academicYear.localeCompare(b.academicYear)
    case 'department':
      return a.departmentName.localeCompare(b.departmentName)
    case 'students':
      return a.studentCount - b.studentCount
    case 'approvedTopics':
      return a.approvedTopicCount - b.approvedTopicCount
    case 'stepsApproved':
      return a.stepsApproved - b.stepsApproved
    case 'waiting':
      return a.waitingReviews - b.waitingReviews
    case 'late':
      return a.lateSteps - b.lateSteps
    case 'overdue':
      return a.overdueSteps - b.overdueSteps
    default:
      return 0
  }
}

// `DataTable` has no sorting of its own (see task-15 brief, Step 5): the caller sorts `rows`
// with this helper, in a `useMemo`, before handing them to `GroupTable`.
export function sortGroupRows(rows: DashboardGroupRow[], sort: GroupSort): DashboardGroupRow[] {
  const sorted = [...rows].sort((a, b) => compareGroupRows(a, b, sort.key))
  return sort.direction === 'asc' ? sorted : sorted.reverse()
}
