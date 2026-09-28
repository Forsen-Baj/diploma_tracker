import { createContext } from 'react'
import type { CurrentUser, LoginResponse, StaffRole } from '../api/types'

export type AuthContextValue = {
  user: CurrentUser | null
  isInitializing: boolean
  login: (email: string, password: string) => Promise<CurrentUser>
  completeSignIn: (result: LoginResponse) => CurrentUser
  logout: () => void
  /** Design 2026-09-27 (phase 12) §5: act in another role the user holds. */
  switchRole: (role: StaffRole) => Promise<CurrentUser>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
