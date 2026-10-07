import { useEffect, useState } from 'react'
import { Brand } from '../components/layout'
import { GitHubLoginButton } from '../features/auth/GitHubLoginButton'
import { ResultPreview } from '../features/landing/ResultPreview'
import { API_PATHS, getApiUrl } from '../lib/api'
import { useAuth } from '../features/auth/AuthContext'

export function LandingPage() {
  const auth = useAuth()
  const authError = auth.status === 'unauthenticated' ? auth.error : undefined
  const [loading, setLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  useEffect(() => {
    const resetLogin = () => setLoading(false)
    window.addEventListener('pageshow', resetLogin)
    return () => window.removeEventListener('pageshow', resetLogin)
  }, [])

  function login() {
    try {
      const loginUrl = new URL(getApiUrl(API_PATHS.githubAuthorize))
      loginUrl.searchParams.set('returnTo', '/projects')
      setLoginError('')
      setLoading(true)
      window.location.assign(loginUrl.href)
    } catch {
      setLoading(false)
      setLoginError('로그인을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-14 break-keep">
      <div className="grid w-full max-w-[1000px] items-center gap-12 md:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <section
          aria-labelledby="welcome-title"
          className="flex min-w-0 flex-col gap-5"
        >
          <Brand size="landing" />
          <h1
            id="welcome-title"
            className="text-[28px] leading-[1.35] font-extrabold tracking-[-1px] text-pretty sm:text-[32px]"
          >
            흩어진 개발 작업에서,
            <br />
            프로젝트의 갈피를 잡으세요.
          </h1>
          <p className="max-w-[440px] text-[15px] leading-[1.75] text-pretty text-muted">
            내가 했던 작업부터 이어받아야 할 작업까지.
            <br />
            기능명세서와 GitHub PR을 연결해 어디까지 진행됐는지, 무엇을 더
            확인해야 하는지 근거와 함께 살펴보세요.
          </p>
          <div className="space-y-3">
            <GitHubLoginButton
              onClick={login}
              loading={loading}
              aria-describedby={
                loginError || authError ? 'login-error' : undefined
              }
              className="w-full sm:w-auto"
            />
            {(loginError || authError) && (
              <p
                id="login-error"
                role="alert"
                className="max-w-[440px] text-[13px] leading-relaxed text-danger"
              >
                {loginError || authError}
              </p>
            )}
          </div>
          <div className="max-w-[440px] space-y-3 border-t border-line pt-4">
            <ul className="space-y-[7px] text-[13px] leading-relaxed text-body">
              {[
                'GitHub 계정으로 간편하게 시작합니다.',
                '접근 권한은 GitHub에서 직접 확인하고 승인합니다.',
                '접근 가능한 개인·조직 저장소를 함께 연결합니다.',
              ].map((text) => (
                <li key={text} className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className="font-extrabold text-success"
                  >
                    ✓
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
            <details className="group text-[13px]">
              <summary className="w-fit list-none rounded-sm py-1 font-bold text-primary [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">
                  어떤 정보를 사용하나요?
                </span>
                <span className="hidden group-open:inline">
                  사용 정보 안내 닫기
                </span>
                <span
                  aria-hidden="true"
                  className="ml-2 inline-block transition-transform group-open:rotate-180"
                >
                  ⌄
                </span>
              </summary>
              <div className="mt-2 rounded-[10px] border border-line bg-surface px-[15px] py-[13px] leading-[1.75] text-muted">
                <ul className="list-disc space-y-1 pl-4">
                  <li>연결할 수 있는 개인·조직 저장소 목록을 확인합니다.</li>
                  <li>
                    PR 제목·본문·커밋 메시지·변경 파일과 README·설정 파일을
                    분석에 사용합니다.
                  </li>
                  <li>
                    기능명세서와 PR 작업 내용을 대조해 관련 근거를 정리합니다.
                  </li>
                </ul>
              </div>
            </details>
          </div>
        </section>
        <ResultPreview />
      </div>
    </main>
  )
}
