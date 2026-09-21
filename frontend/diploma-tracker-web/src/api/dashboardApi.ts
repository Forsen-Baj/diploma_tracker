import { apiRequest } from './apiClient'
import type { AdminDashboard, StudentDashboard, TeacherDashboard } from './types'

export function getStudentDashboard(): Promise<StudentDashboard> {
  return apiRequest<StudentDashboard>('/api/dashboard/student')
}

export function getTeacherDashboard(): Promise<TeacherDashboard> {
  return apiRequest<TeacherDashboard>('/api/dashboard/teacher')
}

export function getAdminDashboard(): Promise<AdminDashboard> {
  return apiRequest<AdminDashboard>('/api/dashboard/admin')
}
