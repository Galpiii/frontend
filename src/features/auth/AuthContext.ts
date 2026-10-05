import { createContext, useContext } from 'react'

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated' }
  | { status: 'unauthenticated'; error?: string }

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const state = useContext(AuthContext)
  if (!state) throw new Error('useAuth must be used inside AuthProvider')
  return state
}
