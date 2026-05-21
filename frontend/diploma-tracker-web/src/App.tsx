import { Navigate, Route, Routes } from 'react-router-dom'
import { LayoutShell } from './components/LayoutShell'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { RoleRedirect } from './auth/RoleRedirect'
import { LoginPage } from './pages/LoginPage'
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

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<LayoutShell />}>
          <Route index element={<RoleRedirect />} />
          <Route path="health" element={<HealthPage />} />
          <Route element={<ProtectedRoute allowedRoles={['Admin', 'Teacher']} />}>
            <Route path="task-templates" element={<TaskTemplatesPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
            <Route path="admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="admin/teachers" element={<TeachersPage />} />
            <Route path="admin/students" element={<StudentsPage />} />
            <Route path="admin/groups" element={<GroupsPage />} />
            <Route path="admin/groups/:groupId" element={<GroupDetailsPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['Teacher']} />}>
            <Route path="teacher/dashboard" element={<TeacherDashboardPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['Student']} />}>
            <Route path="student/dashboard" element={<StudentDashboardPage />} />
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
