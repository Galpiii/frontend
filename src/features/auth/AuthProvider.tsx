import { useEffect, useState, type ReactNode } from 'react'
import { AuthContext, type AuthState } from './AuthContext'
import { onUnauthorized } from './session'
import type { AuthResult } from './bootstrap'

/**
 * Owns the single source of truth for sign-in state. Pages read it with
 * useAuth and never handle a 401 themselves: session.ts reports an expiry
 * here, so authenticated screens need no callback wiring.
 */
export function AuthProvider({
  session,
  children,
}: {
  session: Promise<AuthResult>
  children: ReactNode
}) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    void session.then((result) => {
      if (!active) return
      // A late bootstrap result must not revive a session already expired.
      setState((current) =>
        current.status !== 'loading'
          ? current
          : result.authenticated
            ? { status: 'authenticated' }
            : { status: 'unauthenticated', error: result.error },
      )
    })
    return () => {
      active = false
    }
  }, [session])

  useEffect(
    () =>
      onUnauthorized(() =>
        setState({
          status: 'unauthenticated',
          error: '로그인이 만료되었습니다. 다시 로그인해주세요.',
        }),
      ),
    [],
  )

  return <AuthContext value={state}>{children}</AuthContext>
}
