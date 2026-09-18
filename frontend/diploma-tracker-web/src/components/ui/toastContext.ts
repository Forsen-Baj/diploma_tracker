import { createContext } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export type ToastApi = {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

export const ToastContext = createContext<ToastApi | undefined>(undefined)
