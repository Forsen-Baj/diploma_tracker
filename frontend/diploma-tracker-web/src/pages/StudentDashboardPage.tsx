import { Link } from 'react-router-dom'

export function StudentDashboardPage() {
  return (
    <section className="page-card">
      <h1>Student Dashboard</h1>
      <p><Link to="/student/tasks">Go to My Tasks</Link></p>
    </section>
  )
}
