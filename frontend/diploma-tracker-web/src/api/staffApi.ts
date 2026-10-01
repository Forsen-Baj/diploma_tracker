import { apiRequest } from './apiClient'
import type {
  AddRoleAssignmentRequest,
  CreateStaffRequest,
  RoleAssignment,
  StaffMember,
  StaffOption,
  StaffOptionsQuery,
  StaffRole,
  UpdateStaffRequest
} from './types'

function toQueryString(query: Record<string, string | undefined>): string {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** The administrator's staff list. With `role`, only staff holding it - for `groupId` or
 *  `departmentId` when given (design 2026-09-27, phase 12, §4). */
export function getStaff(query: { role?: StaffRole; groupId?: string; departmentId?: string } = {}): Promise<StaffMember[]> {
  return apiRequest<StaffMember[]>(`/api/staff${toQueryString(query)}`)
}

export function getStaffMember(id: string): Promise<StaffMember> {
  return apiRequest<StaffMember>(`/api/staff/${id}`)
}

export function createStaff(request: CreateStaffRequest): Promise<StaffMember> {
  return apiRequest<StaffMember>('/api/staff', { method: 'POST', body: JSON.stringify(request) })
}

export function updateStaff(id: string, request: UpdateStaffRequest): Promise<StaffMember> {
  return apiRequest<StaffMember>(`/api/staff/${id}`, { method: 'PUT', body: JSON.stringify(request) })
}

export async function deactivateStaff(id: string): Promise<void> {
  await apiRequest<void>(`/api/staff/${id}/deactivate`, { method: 'PATCH' })
}

export async function setStaffPassword(id: string, password: string): Promise<void> {
  await apiRequest<void>(`/api/staff/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) })
}

export function addRoleAssignment(staffId: string, request: AddRoleAssignmentRequest): Promise<RoleAssignment> {
  return apiRequest<RoleAssignment>(`/api/staff/${staffId}/roles`, { method: 'POST', body: JSON.stringify(request) })
}

/** A refusal while the role is in use is an `ApiError` with code `roleAssignment.inUse` and the
 *  blockers in `payload.errors` (`RoleAssignmentBlocker[]`). */
export async function removeRoleAssignment(staffId: string, assignmentId: string): Promise<void> {
  await apiRequest<void>(`/api/staff/${staffId}/roles/${assignmentId}`, { method: 'DELETE' })
}

/** The pickers: extra reviewers (`studentTaskId`), direction managers, standards controllers. */
export function searchStaff(search: string, query: StaffOptionsQuery = {}): Promise<StaffOption[]> {
  return apiRequest<StaffOption[]>(`/api/staff/options${toQueryString({ search, ...query })}`)
}
