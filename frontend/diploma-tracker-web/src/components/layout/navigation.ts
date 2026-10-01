import type { ActingRole, CurrentUser, StaffRole } from '../../api/types'
import type uk from '../../i18n/uk.json'

export type NavLabelKey = `nav.${keyof typeof uk.nav}`
export type Role = ActingRole

export type NavItem = {
  to: string
  labelKey: NavLabelKey
  /** Shows the number of documents waiting for the signed-in user. */
  badge?: 'documents'
}

/** Design 2026-09-27 (phase 12) §4.2: every staff role has its own dashboard at the same address;
 *  a staff member acting in no role starts on their documents. */
export const homeRouteByRole: Record<Role, string> = {
  Admin: '/admin/dashboard',
  Teacher: '/staff/dashboard',
  DirectionManager: '/staff/dashboard',
  StandardsController: '/staff/dashboard',
  Staff: '/documents',
  Student: '/student/dashboard'
}

export const navigationByRole: Record<Role, NavItem[]> = {
  Admin: [
    { to: '/admin/dashboard', labelKey: 'nav.dashboard' },
    { to: '/admin/faculties', labelKey: 'nav.faculties' },
    { to: '/admin/groups', labelKey: 'nav.groups' },
    { to: '/review', labelKey: 'nav.review' },
    { to: '/admin/students', labelKey: 'nav.students' },
    { to: '/admin/staff', labelKey: 'nav.staff' },
    { to: '/admin/topics', labelKey: 'nav.topics' },
    { to: '/documents', labelKey: 'nav.documents', badge: 'documents' },
    { to: '/archive', labelKey: 'nav.archive' },
    { to: '/task-templates', labelKey: 'nav.taskTemplates' },
    { to: '/admins', labelKey: 'nav.admins' },
    { to: '/admin/settings', labelKey: 'nav.settings' }
  ],
  Teacher: [
    { to: '/staff/dashboard', labelKey: 'nav.dashboard' },
    { to: '/review', labelKey: 'nav.review' },
    { to: '/staff/groups', labelKey: 'nav.groups' },
    { to: '/staff/topics', labelKey: 'nav.myTopics' },
    { to: '/documents', labelKey: 'nav.documents', badge: 'documents' },
    { to: '/archive', labelKey: 'nav.archive' },
    { to: '/task-templates', labelKey: 'nav.taskTemplates' }
  ],
  DirectionManager: [
    { to: '/staff/dashboard', labelKey: 'nav.dashboard' },
    { to: '/review', labelKey: 'nav.review' },
    { to: '/staff/groups', labelKey: 'nav.groups' },
    { to: '/staff/directions', labelKey: 'nav.directions' },
    { to: '/documents', labelKey: 'nav.documents', badge: 'documents' }
  ],
  StandardsController: [
    { to: '/staff/dashboard', labelKey: 'nav.dashboard' },
    { to: '/review', labelKey: 'nav.review' },
    { to: '/staff/groups', labelKey: 'nav.groups' },
    { to: '/documents', labelKey: 'nav.documents', badge: 'documents' }
  ],
  Staff: [
    { to: '/documents', labelKey: 'nav.documents', badge: 'documents' }
  ],
  Student: [
    { to: '/student/dashboard', labelKey: 'nav.dashboard' },
    { to: '/student/topics', labelKey: 'nav.topics' },
    { to: '/student/tasks', labelKey: 'nav.myTasks' },
    { to: '/documents', labelKey: 'nav.documents', badge: 'documents' }
  ]
}

/** The three staff roles in their sign-in order (phase 12 §5). */
export const staffRoles: StaffRole[] = ['Teacher', 'DirectionManager', 'StandardsController']

/** The staff roles the user holds somewhere, in sign-in order. */
export function heldRoles(user: CurrentUser): StaffRole[] {
  return staffRoles.filter((role) => user.assignments.some((assignment) => assignment.role === role))
}
