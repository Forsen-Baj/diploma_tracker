export class ApiError extends Error {
  status: number
  payload: unknown

  constructor(status: number, message: string, payload: unknown = null) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

if (!API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL is not configured.')
}

const TOKEN_STORAGE_KEY = 'diploma_tracker_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

export function isApiConflict(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409
}

type ErrorPayload = {
  message?: string
  title?: string
  errors?: unknown
}

function firstValidationMessage(errors: unknown): string | undefined {
  if (!errors || typeof errors !== 'object' || Array.isArray(errors)) {
    return undefined
  }

  const first = Object.values(errors as Record<string, unknown>)[0]
  return Array.isArray(first) && typeof first[0] === 'string' ? first[0] : undefined
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const headers = new Headers(init?.headers)

  if (!(init?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ErrorPayload | null
    const fallback = response.status === 429
      ? 'Too many attempts. Wait a minute and try again.'
      : `Request failed with status ${response.status}`
    const message = payload?.message ?? firstValidationMessage(payload?.errors) ?? payload?.title ?? fallback
    throw new ApiError(response.status, message, payload)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}
