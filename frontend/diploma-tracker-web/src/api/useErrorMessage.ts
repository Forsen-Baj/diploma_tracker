import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from './apiClient'

export function useCodeMessage() {
  const { t, i18n } = useTranslation()

  return useCallback((code: string, params?: Record<string, string | number>, fallback?: string): string => {
    const key = `errors.${code}`
    if (i18n.exists(key)) {
      return String(t(key as never, params as never))
    }

    return fallback ?? String(t('errors.server.unexpected'))
  }, [t, i18n])
}

export function useErrorMessage() {
  const { t } = useTranslation()
  const codeMessage = useCodeMessage()

  return useCallback((error: unknown): string => {
    if (error instanceof ApiError) {
      if (error.code) {
        return codeMessage(error.code, undefined, error.message)
      }

      if (error.status === 401) return t('errors.auth.unauthorized')
      if (error.status === 403) return t('errors.access.forbidden')
      if (error.status === 429) return t('errors.request.tooMany')
      return error.message
    }

    if (error instanceof TypeError) {
      return t('errors.network')
    }

    return t('errors.server.unexpected')
  }, [t, codeMessage])
}
