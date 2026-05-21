import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

function dashboardRoute(role: 'Admin' | 'Teacher' | 'Student'): string {
  if (role === 'Admin') return '/admin/dashboard'
  if (role === 'Teacher') return '/teacher/dashboard'
  return '/student/dashboard'
}

export function LayoutShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>Diploma Tracker</div>
        {user && (
          <div className="top-bar-right">
            <span className="user-info">{user.firstName} {user.lastName} ({user.role})</span>
            <button className="secondary-button" onClick={handleLogout}>Logout</button>
          </div>
        )}
      </header>
      <div className="content-wrap">
        <aside className="side-bar">
          {user && (
            <NavLink to={dashboardRoute(user.role)} className={({ isActive }) => isActive ? 'nav-link nav-link-active' : 'nav-link'}>Dashboard</NavLink>
          )}
          {user?.role === 'Admin' && (
            <>
              <NavLink to="/admin/teachers" className={({ isActive }) => isActive ? 'nav-link nav-link-active' : 'nav-link'}>Teachers</NavLink>
              <NavLink to="/admin/students" className={({ isActive }) => isActive ? 'nav-link nav-link-active' : 'nav-link'}>Students</NavLink>
              <NavLink to="/admin/groups" className={({ isActive }) => isActive ? 'nav-link nav-link-active' : 'nav-link'}>Groups</NavLink>
              <NavLink to="/task-templates" className={({ isActive }) => isActive ? 'nav-link nav-link-active' : 'nav-link'}>Task Templates</NavLink>
            </>
          )}
          {user?.role === 'Teacher' && (
            <NavLink to="/task-templates" className={({ isActive }) => isActive ? 'nav-link nav-link-active' : 'nav-link'}>Task Templates</NavLink>
          )}
          {user?.role === 'Student' && (
            <NavLink to="/student/tasks" className={({ isActive }) => isActive ? 'nav-link nav-link-active' : 'nav-link'}>My Tasks</NavLink>
          )}
          <NavLink to="/health" className={({ isActive }) => isActive ? 'nav-link nav-link-active' : 'nav-link'}>Health</NavLink>
        </aside>
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
