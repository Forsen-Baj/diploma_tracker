import { createContext } from 'react'
import type { CurrentUser } from '../api/types'

export type AuthContextValue = {
  user: CurrentUser | null
  isInitializing: boolean
  login: (email: string, password: string) => Promise<CurrentUser>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
