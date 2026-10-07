import { useAnalysisStart } from '../features/consent/useAnalysisStart'
import { AiConsentModal } from '../features/consent/AiConsentModal'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { AppHeader, AppShell } from '../components/layout'
import { AnalysisStatusBadge } from '../features/projects/AnalysisStatusBadge'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Menu,
  MenuItem,
  Modal,
  SectionHeader,
  Toast,
  type Tone,
  type ToastMessage,
} from '../components/ui'
import { SessionError } from '../features/auth/session'
import {
  deleteProject,
  listProjects,
  renameProject,
  type ProjectSummary,
} from '../features/projects/api'
import { cn } from '../lib/cn'
import { projectAnalysis } from '../features/projects/projectAnalysis'
import { projectKeys } from '../features/projects/keys'

/** A run in one of these states is still working; requesting another is not safe. */
const RUNNING_ANALYSIS = ['QUEUED', 'RUNNING']

let toastSequence = 0

/** Notices handed over by the repository screen arrive as one toast each. */
function arrivingToasts(state: unknown): ToastMessage[] {
  const notices = (state as { analysisNotices?: unknown } | null)
    ?.analysisNotices
  if (!Array.isArray(notices)) return []
  return notices.flatMap((notice) => {
    if (typeof notice !== 'object' || notice === null) return []
    const { text, tone } = notice as Record<string, unknown>
    if (typeof text !== 'string' || text === '') return []
    return [
      {
        id: (toastSequence += 1),
        text,
        tone: (tone === 'warning' ? 'warning' : 'success') as Tone,
      },
    ]
  })
}

/** An unparseable timestamp must not render as "Invalid Date". */
function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('ko-KR')
}

export function ProjectsPage() {
  const analysis = useAnalysisStart()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const query = useQuery({
    queryKey: projectKeys.page(page),
    queryFn: ({ signal }) => listProjects(page, signal),
    // The previous page stays (dimmed) while the next one loads.
    placeholderData: keepPreviousData,
  })
  const result = query.data ?? null
  const loading = query.isPending
  const changingPage = query.isPlaceholderData
  const refreshing = query.isRefetching && !changingPage
  // AuthProvider is told about an expiry by session.ts; this screen is about
  // to unmount, so it must not flash a request error first.
  const error =
    query.isError &&
    !(query.error instanceof SessionError && query.error.status === 401)
      ? '프로젝트 목록을 불러오지 못했습니다. 다시 시도해주세요.'
      : ''

  const [editing, setEditing] = useState<ProjectSummary | null>(null)
  const [editName, setEditName] = useState('')
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)
  const [removingTarget, setRemovingTarget] = useState<ProjectSummary | null>(
    null,
  )
  const [removing, setRemoving] = useState(false)
  const [refreshingId, setRefreshingId] = useState<number | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>(() =>
    arrivingToasts(location.state),
  )

  function showToast(text: string, tone: Tone) {
    setToasts((current) => [
      ...current,
      { id: (toastSequence += 1), text, tone },
    ])
  }

  useEffect(() => {
    if (location.state?.analysisNotices)
      navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])

  /** Refetches in place: the list stays on screen instead of blanking out. */
  function reload() {
    void queryClient.invalidateQueries({ queryKey: projectKeys.lists() })
  }

  async function saveName() {
    if (!editing || saving) return
    const trimmed = editName.trim()
    if (!trimmed) {
      setEditError('프로젝트 이름을 입력해주세요.')
      return
    }
    setSaving(true)
    setEditError('')
    try {
      await renameProject(editing.id, trimmed)
      setEditing(null)
      showToast('프로젝트 정보를 수정했습니다.', 'success')
      reload()
    } catch (cause) {
      if (cause instanceof SessionError && cause.status === 401) return
      setEditError(
        cause instanceof Error
          ? cause.message
          : '프로젝트 정보를 수정하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!removingTarget || removing) return
    setRemoving(true)
    try {
      await deleteProject(removingTarget.id)
      setRemovingTarget(null)
      showToast('프로젝트를 삭제했습니다.', 'success')
      // Deleting the only row on a later page would otherwise strand the user
      // on a page that no longer exists.
      if (result?.projects.length === 1 && page > 0) setPage(page - 1)
      reload()
    } catch (cause) {
      if (cause instanceof SessionError && cause.status === 401) return
      setRemovingTarget(null)
      showToast(
        cause instanceof Error
          ? cause.message
          : '프로젝트를 삭제하지 못했습니다.',
        'danger',
      )
    } finally {
      setRemoving(false)
    }
  }

  async function refreshAnalysis(project: ProjectSummary) {
    if (analysis.flow.state.phase !== 'idle') return
    setRefreshingId(project.id)
    try {
      if (!(await analysis.flow.requestConsent())) return
      projectAnalysis.queue(project.id)
      navigate(`/projects/${project.id}`)
    } catch (cause) {
      if (cause instanceof SessionError && cause.status === 401) return
      showToast('동의 정보를 확인하지 못했습니다.', 'danger')
    } finally {
      setRefreshingId(null)
    }
  }

  function changePage(next: number) {
    setPage(next)
  }

  // The empty state carries its own call to action, so the header button would
  // be a second control for the same thing. It appears once a list exists.
  const hasProjects = (result?.projects.length ?? 0) > 0

  return (
    <AppShell header={<AppHeader />}>
      <div className="mx-auto max-w-[1120px] space-y-5 py-1 sm:py-2">
        <SectionHeader
          level={1}
          title="프로젝트"
          description="프로젝트와 최근 상태를 한곳에서 확인하세요."
          action={
            // Analysis states change on the server, so the list needs a way to
            // catch up. The error state has its own retry, so it is left out.
            result !== null &&
            !error && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  loading={refreshing}
                  icon={<span aria-hidden="true">⟳</span>}
                  onClick={() => void query.refetch()}
                >
                  새로고침
                </Button>
                {hasProjects && (
                  <Button onClick={() => navigate('/projects/new')}>
                    ＋ 새 프로젝트 만들기
                  </Button>
                )}
              </div>
            )
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
                loading={query.isFetching}
                onClick={() => void query.refetch()}
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
            action={
              <Button onClick={() => navigate('/projects/new')}>
                새 프로젝트 분석 시작하기 →
              </Button>
            }
          />
        ) : (
          <>
            <div
              aria-busy={changingPage || undefined}
              className={cn(
                'grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3',
                changingPage && 'opacity-60',
              )}
            >
              {result?.projects.map((project) => (
                <Card key={project.id} className="relative flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 break-words text-[15px] font-extrabold">
                      <Link
                        to={`/projects/${project.id}`}
                        className="after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-primary"
                      >
                        {project.name}
                      </Link>
                    </h2>
                    <div className="flex shrink-0 items-center gap-1">
                      {project.status === 'DRAFT' && (
                        <Badge tone="neutral">저장소 연결 전</Badge>
                      )}
                      <Menu
                        label={`${project.name} 프로젝트 메뉴`}
                        className="relative z-10"
                      >
                        <MenuItem
                          onClick={() => {
                            setEditing(project)
                            setEditName(project.name)
                            setEditError('')
                          }}
                        >
                          프로젝트 정보 수정
                        </MenuItem>
                        <MenuItem
                          disabled={
                            project.repositoryCount === 0 ||
                            refreshingId === project.id ||
                            RUNNING_ANALYSIS.includes(
                              project.lastAnalysis?.status ?? '',
                            )
                          }
                          onClick={() => void refreshAnalysis(project)}
                        >
                          프로젝트 분석 새로고침
                        </MenuItem>
                        <MenuItem
                          tone="danger"
                          onClick={() => setRemovingTarget(project)}
                        >
                          프로젝트 삭제
                        </MenuItem>
                      </Menu>
                    </div>
                  </div>
                  <p className="text-[13px] text-muted">
                    연결된 저장소 {project.repositoryCount}개
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone={project.hasSpecDocument ? 'accent' : 'neutral'}
                    >
                      {project.hasSpecDocument
                        ? '기능명세서 등록됨'
                        : '기능명세서 미등록'}
                    </Badge>
                    <AnalysisStatusBadge
                      status={project.lastAnalysis?.status}
                    />
                  </div>
                  <p className="mt-auto text-xs text-faint">
                    최근 수정 {formatDate(project.updatedAt)}
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

      <Modal
        open={editing !== null}
        onClose={() => {
          if (!saving) setEditing(null)
        }}
        title="프로젝트 정보 수정"
        footer={
          <>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => setEditing(null)}
            >
              취소
            </Button>
            <Button loading={saving} onClick={() => void saveName()}>
              저장
            </Button>
          </>
        }
      >
        <Input
          label="프로젝트 이름"
          required
          value={editName}
          disabled={saving}
          maxLength={100}
          error={editError}
          onChange={(event) => {
            setEditName(event.target.value)
            setEditError('')
          }}
        />
      </Modal>

      <Modal
        open={removingTarget !== null}
        onClose={() => {
          if (!removing) setRemovingTarget(null)
        }}
        title="프로젝트를 삭제할까요?"
        footer={
          <>
            <Button
              variant="secondary"
              disabled={removing}
              onClick={() => setRemovingTarget(null)}
            >
              취소
            </Button>
            <Button
              variant="danger"
              loading={removing}
              onClick={() => void remove()}
            >
              삭제
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Alert tone="danger">
            <b>{removingTarget?.name}</b> 프로젝트를 삭제하면 되돌릴 수
            없습니다.
          </Alert>
          <p className="text-[13px] leading-loose text-body">
            · 연결된 저장소와 수집한 PR, 기능명세서를 더 이상 볼 수 없습니다.
            <br />· 진행 중이던 분석은 취소됩니다.
          </p>
        </div>
      </Modal>

      <Toast
        messages={toasts}
        onDismiss={(id) =>
          setToasts((current) => current.filter((it) => it.id !== id))
        }
      />
      <AiConsentModal flow={analysis.flow} state={analysis.state} />
    </AppShell>
  )
}
