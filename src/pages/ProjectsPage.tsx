import { useEffect, useState } from 'react'
import { AppHeader, AppShell } from '../components/layout'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  SectionHeader,
} from '../components/ui'
import { authenticatedFetch, SessionError } from '../auth/session'
import { API_PATHS } from '../lib/api'

interface Project {
  id: number
  name: string
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  repositoryCount: number
  hasSpecDocument: boolean
  updatedAt: string
}
interface ProjectList {
  projects: Project[]
  page: number
  totalPages: number
}
const statuses = {
  DRAFT: '초안',
  ACTIVE: '진행 중',
  ARCHIVED: '보관됨',
} as const

export function ProjectsPage({
  onSessionExpired,
}: {
  onSessionExpired: () => void
}) {
  const [page, setPage] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<ProjectList | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    async function loadProjects() {
      try {
        const response = await authenticatedFetch(
          `${API_PATHS.projects}?page=${page}&size=12&sort=UPDATED_AT`,
          { signal: controller.signal },
        )
        if (!response.ok) throw new Error('Project list request failed')
        const body = await response.json()
        if (
          !Array.isArray(body?.data?.projects) ||
          !Number.isInteger(body.data.totalPages)
        )
          throw new Error('Invalid project list')
        if (!controller.signal.aborted) setResult(body.data)
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof SessionError && cause.status === 401) {
          onSessionExpired()
          return
        }
        setError('프로젝트 목록을 불러오지 못했습니다. 다시 시도해주세요.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadProjects()
    return () => controller.abort()
  }, [page, attempt, onSessionExpired])

  function changePage(next: number) {
    setLoading(true)
    setError('')
    setPage(next)
  }

  return (
    <AppShell header={<AppHeader context="프로젝트" />}>
      <div className="mx-auto max-w-[1120px] space-y-5 py-1 sm:py-2">
        <SectionHeader
          level={1}
          title="프로젝트"
          description="프로젝트와 최근 상태를 한곳에서 확인하세요."
          action={
            <div className="space-y-1.5">
              <Button disabled aria-describedby="create-project-hint">
                ＋ 새 프로젝트 만들기
              </Button>
              <p id="create-project-hint" className="text-xs text-muted">
                프로젝트 생성 기능은 준비 중입니다.
              </p>
            </div>
          }
        />
        {loading ? (
          <Card>
            <p role="status" className="py-8 text-center text-muted">
              프로젝트를 불러오고 있습니다…
            </p>
          </Card>
        ) : error ? (
          <Alert
            tone="danger"
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setLoading(true)
                  setError('')
                  setAttempt((value) => value + 1)
                }}
              >
                다시 시도
              </Button>
            }
          >
            {error}
          </Alert>
        ) : result?.projects.length === 0 ? (
          <EmptyState
            level={2}
            title="아직 프로젝트가 없습니다"
            description="기능명세서와 GitHub 저장소를 연결해 기능별 개발 작업을 확인할 수 있습니다."
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result?.projects.map((project) => (
                <Card key={project.id} className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 break-words text-[15px] font-extrabold">
                      {project.name}
                    </h2>
                    <Badge
                      tone={project.status === 'ACTIVE' ? 'success' : 'neutral'}
                    >
                      {statuses[project.status] ?? project.status}
                    </Badge>
                  </div>
                  <p className="text-[13px] text-muted">
                    연결된 저장소 {project.repositoryCount}개
                  </p>
                  <div>
                    <Badge
                      tone={project.hasSpecDocument ? 'accent' : 'neutral'}
                    >
                      {project.hasSpecDocument
                        ? '기능명세서 등록됨'
                        : '기능명세서 미등록'}
                    </Badge>
                  </div>
                  <p className="mt-auto text-xs text-faint">
                    최근 수정{' '}
                    {new Date(project.updatedAt).toLocaleDateString('ko-KR')}
                  </p>
                </Card>
              ))}
            </div>
            {result && result.totalPages > 1 && (
              <nav
                aria-label="프로젝트 목록 페이지"
                className="flex items-center justify-center gap-4"
              >
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page === 0}
                  onClick={() => changePage(page - 1)}
                >
                  이전
                </Button>
                <span className="text-[13px] text-muted">
                  {page + 1} / {result.totalPages}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page + 1 >= result.totalPages}
                  onClick={() => changePage(page + 1)}
                >
                  다음
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
