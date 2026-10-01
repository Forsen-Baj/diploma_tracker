import { apiRequest } from './apiClient'
import type { ProposeTopicRequest, Reservation, ReservationStatus, WordingRequest } from './types'

export function reserveTopic(topicId: string): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/topics/${topicId}/reserve`, { method: 'POST' })
}

export function proposeTopic(request: ProposeTopicRequest): Promise<Reservation> {
  return apiRequest<Reservation>('/api/topics/proposals', { method: 'POST', body: JSON.stringify(request) })
}

export function approveReservation(id: string): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/reservations/${id}/approve`, { method: 'POST' })
}

export function rejectReservation(id: string, comment?: string): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/reservations/${id}/reject`, { method: 'POST', body: JSON.stringify({ comment }) })
}

export function cancelReservation(id: string): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/reservations/${id}/cancel`, { method: 'POST' })
}

export function releaseReservation(id: string, comment?: string): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/reservations/${id}/release`, { method: 'POST', body: JSON.stringify({ comment }) })
}

/** Assigns a topic (it still needs the other approvals) or, with null, clears it. Admin only. */
export function setStudentTopic(studentId: string, topicId: string | null): Promise<void> {
  return apiRequest<void>(`/api/students/${studentId}/topic`, { method: 'PUT', body: JSON.stringify({ topicId }) })
}

export function getMyReservations(): Promise<Reservation[]> {
  return apiRequest<Reservation[]>('/api/reservations/mine')
}

/** `Pending` returns every open request (waiting for approvers or returned to the student). */
export function getReservationsForDecision(status: Extract<ReservationStatus, 'Pending' | 'Approved'> = 'Pending', waitingForMe = false): Promise<Reservation[]> {
  return apiRequest<Reservation[]>(`/api/reservations/pending?status=${status}${waitingForMe ? '&waitingForMe=true' : ''}`)
}

export function getReservation(id: string): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/reservations/${id}`)
}

export function returnReservation(id: string, comment: string): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/reservations/${id}/return`, { method: 'POST', body: JSON.stringify({ comment }) })
}

export function editReservationWording(id: string, request: WordingRequest): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/reservations/${id}/wording`, { method: 'PUT', body: JSON.stringify(request) })
}

export function resubmitReservation(id: string, request: WordingRequest): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/reservations/${id}/resubmit`, { method: 'POST', body: JSON.stringify(request) })
}
