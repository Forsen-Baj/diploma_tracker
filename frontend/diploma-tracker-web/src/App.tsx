import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { RoleRedirect } from './auth/RoleRedirect'
import { LoginPage } from './pages/LoginPage'
import { ClaimAccountPage } from './pages/ClaimAccountPage'
import { AccountPage } from './pages/AccountPage'
import { HealthPage } from './pages/HealthPage'
import { AdminDashboardPage } from './pages/AdminDashboardPage'
import { TeacherDashboardPage } from './pages/TeacherDashboardPage'
import { StudentDashboardPage } from './pages/StudentDashboardPage'
import { StudentMyTasksPage } from './pages/StudentMyTasksPage'
import { StudentTaskDetailsPage } from './pages/StudentTaskDetailsPage'
import { TeachersPage } from './pages/TeachersPage'
import { StudentsPage } from './pages/StudentsPage'
import { GroupsPage } from './pages/GroupsPage'
import { GroupDetailsPage } from './pages/GroupDetailsPage'
import { TaskTemplatesPage } from './pages/TaskTemplatesPage'
import { FacultiesPage } from './pages/FacultiesPage'
import { AdminsPage } from './pages/AdminsPage'
import { StudentTopicsPage } from './pages/StudentTopicsPage'
import { TeacherTopicsPage } from './pages/TeacherTopicsPage'
import { AdminTopicsPage } from './pages/AdminTopicsPage'
import { AdminSettingsPage } from './pages/AdminSettingsPage'
import { ReviewQueuePage } from './pages/ReviewQueuePage'
import { ReviewStepPage } from './pages/ReviewStepPage'
import { TeacherGroupsPage } from './pages/TeacherGroupsPage'
import { GroupProgressPage } from './pages/GroupProgressPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/claim" element={<ClaimAccountPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<AppShell />}>
          <Route index element={<RoleRedirect />} />
          <Route path="health" element={<HealthPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route element={<ProtectedRoute allowedRoles={['Admin', 'Teacher']} />}>
            <Route path="task-templates" element={<TaskTemplatesPage />} />
            <Route path="review" element={<ReviewQueuePage />} />
            <Route path="review/steps/:id" element={<ReviewStepPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
            <Route path="admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="admin/teachers" element={<TeachersPage />} />
            <Route path="admin/students" element={<StudentsPage />} />
            <Route path="admin/faculties" element={<FacultiesPage />} />
            <Route path="admin/groups" element={<GroupsPage />} />
            <Route path="admin/groups/:groupId" element={<GroupDetailsPage />} />
            <Route path="admin/topics" element={<AdminTopicsPage />} />
            <Route path="admin/settings" element={<AdminSettingsPage />} />
            <Route path="admins" element={<AdminsPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['Teacher']} />}>
            <Route path="teacher/dashboard" element={<TeacherDashboardPage />} />
            <Route path="teacher/topics" element={<TeacherTopicsPage />} />
            <Route path="teacher/groups" element={<TeacherGroupsPage />} />
            <Route path="teacher/groups/:groupId" element={<GroupProgressPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['Student']} />}>
            <Route path="student/dashboard" element={<StudentDashboardPage />} />
            <Route path="student/topics" element={<StudentTopicsPage />} />
            <Route path="student/tasks" element={<StudentMyTasksPage />} />
            <Route path="student/tasks/:id" element={<StudentTaskDetailsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
