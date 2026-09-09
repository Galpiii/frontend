import { useEffect } from 'react'
import { LandingPage } from './pages/LandingPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { Brand } from './components/layout'
import { useAuth } from './auth/AuthContext'

export default function App() {
  const auth = useAuth()

  useEffect(() => {
    if (auth.status === 'loading') return
    const authenticated = auth.status === 'authenticated'
    window.history.replaceState(
      window.history.state,
      '',
      authenticated ? '/projects' : '/',
    )
    document.title = authenticated
      ? '갈피 · 프로젝트'
      : '갈피 · 프로젝트의 갈피를 잡으세요'
  }, [auth.status])

  if (auth.status === 'loading')
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-5">
        <Brand size="landing" />
        <p role="status" className="text-muted">
          로그인 정보를 확인하고 있습니다…
        </p>
      </main>
    )
  if (auth.status === 'unauthenticated')
    return <LandingPage authError={auth.error} />
  return <ProjectsPage />
}
