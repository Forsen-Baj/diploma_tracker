import { ApiError } from '../api/apiClient'

type ErrorModalProps = {
  message: string
  onClose: () => void
}

export function ErrorModal({ message, onClose }: ErrorModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>Error</h3>
        <p>{message}</p>
        <button className="primary-button" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

export function isApiConflict(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409
}
