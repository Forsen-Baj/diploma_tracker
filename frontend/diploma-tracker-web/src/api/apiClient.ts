export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const API_BASE_URL = 'http://localhost:5000'

export function getToken(): string | null {
  return localStorage.getItem('diploma_tracker_token')
}

export function setToken(token: string): void {
  localStorage.setItem('diploma_tracker_token', token)
}

export function clearToken(): void {
  localStorage.removeItem('diploma_tracker_token')
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  })

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`
    try {
      const payload = await response.json() as { message?: string }
      if (payload.message) {
        errorMessage = payload.message
      }
    } catch {
    }
    throw new ApiError(response.status, errorMessage)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}
