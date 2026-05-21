import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getCurrentUser, login as loginRequest } from '../api/authApi'
import { clearToken, getToken, setToken } from '../api/apiClient'
import type { CurrentUser } from '../api/types'

type AuthContextValue = {
  user: CurrentUser | null
  isInitializing: boolean
  login: (email: string, password: string) => Promise<CurrentUser>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
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

  const value = useMemo<AuthContextValue>(() => {
    return {
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
    }
  }, [user, isInitializing])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
