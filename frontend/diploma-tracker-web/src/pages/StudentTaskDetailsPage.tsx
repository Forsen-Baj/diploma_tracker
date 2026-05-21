import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getMyStudentTaskDetails } from '../api/groupTasksApi'
import type { MyStudentTaskDetails } from '../api/types'

export function StudentTaskDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const [task, setTask] = useState<MyStudentTaskDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!id) return
      setIsLoading(true)
      setError('')
      try {
        setTask(await getMyStudentTaskDetails(id))
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id])

  return (
    <div className="groups-page">
      <section className="page-card">
        <p><Link to="/student/tasks">Back to My Tasks</Link></p>
        {isLoading && <p>Loading task details...</p>}
        {!isLoading && error && <p className="error-text">{error}</p>}
        {!isLoading && !error && task && (
          <>
            <h1>{task.order}. {task.title}</h1>
            <p>{task.description || 'No description'}</p>
            <p><strong>Deadline:</strong> {new Date(task.deadline).toLocaleString()}</p>
            <p><strong>Status:</strong> {task.displayStatus}</p>
            <p><strong>Current mark:</strong> {task.currentMark ?? 'N/A'}</p>
            <p><strong>Completed at:</strong> {task.completedAt ? new Date(task.completedAt).toLocaleString() : 'Not completed'}</p>
          </>
        )}
      </section>

      <section className="page-card">
        <h2>Submission History</h2>
        {!task || task.submissions.length === 0 ? (
          <p>No submissions yet.</p>
        ) : (
          <div className="list-grid">
            {task.submissions.map((submission) => (
              <article className="entity-card" key={submission.id}>
                <p><strong>File:</strong> {submission.originalFileName}</p>
                <p><strong>Submitted at:</strong> {new Date(submission.submittedAt).toLocaleString()}</p>
                <p><strong>Late:</strong> {submission.isLate ? 'Yes' : 'No'}</p>
                <p><strong>Comment:</strong> {submission.comment ?? 'N/A'}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="page-card">
        <h2>Review History</h2>
        {!task || task.reviews.length === 0 ? (
          <p>No reviews yet.</p>
        ) : (
          <div className="list-grid">
            {task.reviews.map((review) => (
              <article className="entity-card" key={review.id}>
                <p><strong>Reviewer:</strong> {review.reviewerFirstName} {review.reviewerLastName}</p>
                <p><strong>Mark:</strong> {review.mark ?? 'N/A'}</p>
                <p><strong>Decision:</strong> {review.decision ?? 'N/A'}</p>
                <p><strong>Comment:</strong> {review.comment ?? 'N/A'}</p>
                <p><strong>Created at:</strong> {new Date(review.createdAt).toLocaleString()}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
