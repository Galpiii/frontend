import { Navigate, Outlet, Route, Routes } from 'react-router'
import { LandingPage } from './pages/LandingPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { Brand } from './components/layout'
import { useAuth } from './auth/AuthContext'

/** Screens behind sign-in. An expiry flips AuthProvider and lands here. */
function RequireAuth() {
  const auth = useAuth()
  if (auth.status !== 'authenticated') return <Navigate to="/" replace />
  return <Outlet />
}

/** Sign-in screens; a signed-in visitor belongs on their project list. */
function GuestOnly() {
  const auth = useAuth()
  if (auth.status === 'authenticated') return <Navigate to="/projects" replace />
  return <Outlet />
}

export default function App() {
  const auth = useAuth()

  if (auth.status === 'loading')
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-5">
        <Brand size="landing" />
        <p role="status" className="text-muted">
          로그인 정보를 확인하고 있습니다…
        </p>
      </main>
    )

  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/" element={<LandingPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/projects" element={<ProjectsPage />} />
      </Route>
      {/*
        main.tsx already consumed the one-time code, so the callback URL has
        nothing left to read. Hand it to the guards, which send the visitor to
        their project list or back to sign-in.
      */}
      <Route path="/auth/callback" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
