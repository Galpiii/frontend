import { useEffect, useState } from 'react'
import { LandingPage } from './pages/LandingPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { Brand } from './components/layout'
import type { AuthResult } from './auth/bootstrap'

export default function App({ session }: { session: Promise<AuthResult> }) {
  const [auth, setAuth] = useState<AuthResult | null>(null)
  useEffect(() => {
    let active = true
    void session.then((result) => {
      if (!active) return
      window.history.replaceState(
        null,
        '',
        result.authenticated ? '/projects' : '/',
      )
      document.title = result.authenticated
        ? '갈피 · 프로젝트'
        : '갈피 · 프로젝트의 갈피를 잡으세요'
      setAuth(result)
    })
    return () => {
      active = false
    }
  }, [session])

  if (!auth)
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-5">
        <Brand size="landing" />
        <p role="status" className="text-muted">
          로그인 정보를 확인하고 있습니다…
        </p>
      </main>
    )
  if (!auth.authenticated) return <LandingPage authError={auth.error} />
  return (
    <ProjectsPage
      onSessionExpired={() => {
        window.history.replaceState(null, '', '/')
        document.title = '갈피 · 로그인'
        setAuth({
          authenticated: false,
          error: '로그인이 만료되었습니다. 다시 로그인해주세요.',
        })
      }}
    />
  )
}
