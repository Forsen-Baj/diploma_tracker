export class ApiError extends Error {
  status: number
  code: string | null
  fields: Record<string, string[]> | null
  payload: unknown

  constructor(status: number, message: string, code: string | null, fields: Record<string, string[]> | null, payload: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
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

type UnauthorizedHandler = () => void

let unauthorizedHandler: UnauthorizedHandler | null = null

// Lets `AuthProvider` clear the signed-in user (and therefore let `ProtectedRoute` redirect to
// `/login`) as soon as the API reports an expired or invalid token, instead of leaving a dead
// session that keeps showing "Your session has ended" on every action.
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler
}

type ErrorPayload = {
  code?: string
  message?: string
  fields?: Record<string, string[]>
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken()
  const headers = new Headers(init?.headers)

  if (init?.body !== undefined && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })

  if (!response.ok) {
    if (response.status === 401) {
      clearToken()
      unauthorizedHandler?.()
    }

    const payload = await response.json().catch(() => null) as ErrorPayload | null
    throw new ApiError(
      response.status,
      payload?.message ?? `Request failed with status ${response.status}`,
      payload?.code ?? null,
      payload?.fields ?? null,
      payload
    )
  }

  return response
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await send(path, init)
  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

function parseFileName(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null
  }

  // RFC 5987 extended notation takes precedence: filename*=UTF-8''%D0%9F%D1%80...
  const extendedMatch = /filename\*\s*=\s*[^']*''([^;]+)/i.exec(contentDisposition)
  if (extendedMatch) {
    try {
      return decodeURIComponent(extendedMatch[1].trim())
    } catch {
      // fall through to the plain filename, if any
    }
  }

  const plainMatch = /filename\s*=\s*"?([^";]+)"?/i.exec(contentDisposition)
  if (plainMatch) {
    return plainMatch[1].trim()
  }

  return null
}

export async function apiDownload(path: string): Promise<{ blob: Blob; fileName: string | null }> {
  const response = await send(path)
  const blob = await response.blob()
  const fileName = parseFileName(response.headers.get('Content-Disposition'))
  return { blob, fileName }
}

