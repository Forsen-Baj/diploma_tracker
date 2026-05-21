import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMyStudentTasks } from '../api/groupTasksApi'
import type { MyStudentTask } from '../api/types'

const filters = ['All', 'Pending', 'Submitted', 'SubmittedLate', 'NeedsRevision', 'Completed', 'MissedDeadline'] as const

export function StudentMyTasksPage() {
  const [tasks, setTasks] = useState<MyStudentTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<(typeof filters)[number]>('All')

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError('')
      try {
        setTasks(await getMyStudentTasks())
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  const filteredTasks = useMemo(() => {
    if (filter === 'All') {
      return tasks
    }
    return tasks.filter((task) => task.displayStatus === filter || task.status === filter)
  }, [tasks, filter])

  return (
    <div className="groups-page">
      <section className="page-card">
        <h1>My Tasks</h1>
        <div className="actions-row">
          {filters.map((item) => (
            <button
              key={item}
              className="secondary-button"
              onClick={() => setFilter(item)}
              disabled={filter === item}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="page-card">
        {isLoading && <p>Loading tasks...</p>}
        {!isLoading && error && <p className="error-text">{error}</p>}
        {!isLoading && !error && filteredTasks.length === 0 && <p>No tasks found.</p>}
        {!isLoading && !error && filteredTasks.length > 0 && (
          <div className="list-grid">
            {filteredTasks.map((task) => (
              <article className="entity-card" key={task.id}>
                <h3>{task.order}. {task.title}</h3>
                <p>{task.description || 'No description'}</p>
                <p><strong>Deadline:</strong> {new Date(task.deadline).toLocaleString()}</p>
                <p><strong>Status:</strong> {task.displayStatus}</p>
                <p><strong>Mark:</strong> {task.currentMark ?? 'N/A'}</p>
                <p><strong>Latest reviewer comment:</strong> {task.latestReviewerComment ?? 'No reviews yet'}</p>
                <Link to={`/student/tasks/${task.id}`}>Open details</Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
