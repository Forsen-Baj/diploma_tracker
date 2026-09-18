import { apiRequest } from './apiClient'
import type { ChangePasswordRequest, ClaimAccountRequest, CurrentUser, LoginRequest, LoginResponse } from './types'

export async function login(request: LoginRequest): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/api/auth/me')
}

export async function claimAccount(request: ClaimAccountRequest): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/claim', {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

export async function changePassword(request: ChangePasswordRequest): Promise<void> {
  await apiRequest<void>('/api/auth/password', {
    method: 'PUT',
    body: JSON.stringify(request)
  })
}
