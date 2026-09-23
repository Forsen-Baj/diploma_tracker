import type { CurrentUser } from '../../api/types'
import type uk from '../../i18n/uk.json'

export type NavLabelKey = `nav.${keyof typeof uk.nav}`
export type Role = CurrentUser['role']

export type NavItem = {
  to: string
  labelKey: NavLabelKey
}

export const dashboardRouteByRole: Record<Role, string> = {
  Admin: '/admin/dashboard',
  Teacher: '/teacher/dashboard',
  Student: '/student/dashboard'
}

export const navigationByRole: Record<Role, NavItem[]> = {
  Admin: [
    { to: '/admin/dashboard', labelKey: 'nav.dashboard' },
    { to: '/admin/faculties', labelKey: 'nav.faculties' },
    { to: '/admin/groups', labelKey: 'nav.groups' },
    { to: '/review', labelKey: 'nav.review' },
    { to: '/admin/students', labelKey: 'nav.students' },
    { to: '/admin/teachers', labelKey: 'nav.teachers' },
    { to: '/admin/topics', labelKey: 'nav.topics' },
    { to: '/documents', labelKey: 'nav.documents' },
    { to: '/archive', labelKey: 'nav.archive' },
    { to: '/task-templates', labelKey: 'nav.taskTemplates' },
    { to: '/admins', labelKey: 'nav.admins' },
    { to: '/admin/settings', labelKey: 'nav.settings' }
  ],
  Teacher: [
    { to: '/teacher/dashboard', labelKey: 'nav.dashboard' },
    { to: '/review', labelKey: 'nav.review' },
    { to: '/teacher/groups', labelKey: 'nav.groups' },
    { to: '/teacher/topics', labelKey: 'nav.myTopics' },
    { to: '/documents', labelKey: 'nav.documents' },
    { to: '/archive', labelKey: 'nav.archive' },
    { to: '/task-templates', labelKey: 'nav.taskTemplates' }
  ],
  Student: [
    { to: '/student/dashboard', labelKey: 'nav.dashboard' },
    { to: '/student/topics', labelKey: 'nav.topics' },
    { to: '/student/tasks', labelKey: 'nav.myTasks' },
    { to: '/documents', labelKey: 'nav.documents' }
  ]
}
