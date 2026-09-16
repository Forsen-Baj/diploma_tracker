import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getCurrentUser, login as loginRequest } from '../api/authApi'
import { clearToken, getToken, setToken } from '../api/apiClient'
import type { CurrentUser } from '../api/types'
import { AuthContext, type AuthContextValue } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    if (!getToken()) {
      setIsInitializing(false)
      return
    }

    getCurrentUser()
      .then((currentUser) => {
        setUser(currentUser)
      })
      .catch(() => {
        clearToken()
        setUser(null)
      })
      .finally(() => {
        setIsInitializing(false)
      })
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isInitializing,
    login: async (email: string, password: string) => {
      const result = await loginRequest({ email, password })
      setToken(result.token)
      setUser(result.user)
      return result.user
    },
    logout: () => {
      clearToken()
      setUser(null)
    }
  }), [user, isInitializing])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
