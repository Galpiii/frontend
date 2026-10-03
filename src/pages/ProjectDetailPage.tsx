import { useEffect, useSyncExternalStore } from 'react'
import {
  Link,
  Navigate,
  useParams,
  useSearchParams,
  useNavigate,
} from 'react-router'
import { projectAnalysis } from '../analysis/projectAnalysis'
import { AppHeader, AppShell, Sidebar } from '../components/layout'
import { useProjectOverview } from './useProjectOverview'
import { ProjectRepositoryCards } from './ProjectRepositoryCards'
import { ProjectPullRequests } from './ProjectPullRequests'
import { ProjectSpecification } from './ProjectSpecification'
import { displayDate } from '../lib/projectOverviewApi'
import { Alert, Button, SectionHeader, StatCard } from '../components/ui'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { NewProjectPage } from './NewProjectPage'
import { resumeOnboardingStep } from './onboardingSteps'

export function ProjectDetailPage() {
  const { projectId } = useParams()
  const id = Number(projectId)
  if (!Number.isSafeInteger(id) || id <= 0)
    return <Navigate to="/projects" replace />
  return <ProjectHome key={id} projectId={id} />
}

function ProjectHome({ projectId }: { projectId: number }) {
  const state = useSyncExternalStore(projectAnalysis.subscribe, () =>
    projectAnalysis.get(projectId),
  )
  const project = state.project
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const tab =
    requestedTab === 'prs' || requestedTab === 'spec' ? requestedTab : 'home'
  const overview = useProjectOverview(projectId, project)
  const openSpec = () => navigate(`/project/${projectId}?tab=spec`)
  useDocumentTitle(project?.name ?? '프로젝트')
  useEffect(() => {
    void projectAnalysis.consume(projectId)
    void projectAnalysis.refresh(projectId)
    // Only GETs repeat. Navigation/unmount never aborts a submitted mutation.
    const timer = window.setInterval(() => {
      void projectAnalysis.refresh(projectId)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [projectId])

  if (project && state.phase === 'idle') {
    const step = resumeOnboardingStep(project)
    if (step === 'SPEC') return <NewProjectPage project={project} />
    if (step === 'REPOSITORIES')
      return <Navigate to={`/projects/${projectId}/repositories`} replace />
  }
  const requesting = ['queued', 'requesting'].includes(state.phase)
  const unknown = state.phase === 'unknown'
  const rejected = state.phase === 'rejected'
  const status = state.awaitingRun ? undefined : project?.lastAnalysis?.status
  const failedRepos =
    overview.data?.overview?.repositories.filter((repo) => repo.failedCount > 0)
      .length ?? 0
  const showFailures =
    !requesting &&
    !unknown &&
    !rejected &&
    !state.awaitingRun &&
    !['QUEUED', 'RUNNING'].includes(status ?? '') &&
    failedRepos > 0
  const title = requesting
    ? '분석 요청 중'
    : unknown
      ? '분석 접수 여부를 확인하고 있습니다'
      : rejected
        ? state.waitingForOtherRun
          ? '진행 중인 분석이 끝난 뒤 다시 요청해주세요'
          : state.preflightFailed
            ? '분석 요청을 준비하지 못했습니다'
            : '분석 요청이 거절되었습니다'
        : status === 'RUNNING'
          ? '분석 중'
          : status === 'QUEUED'
            ? '분석 대기 중'
            : state.phase === 'confirmed' && !status
              ? '분석 요청이 접수되었습니다'
              : status === 'FAILED' ||
                  status === 'PARTIALLY_COMPLETED' ||
                  status === 'RATE_LIMITED'
                ? '분석 결과를 확인해주세요'
                : !project?.specDocument
                  ? '기능명세서를 등록해주세요'
                  : '프로젝트 분석 현황'
  const description = requesting
    ? '저장소가 연결되었습니다. 서버가 분석 요청을 접수하는 중입니다.'
    : unknown
      ? '응답을 확인하지 못했습니다. 중복 분석을 방지하기 위해 서버 상태만 확인합니다.'
      : rejected
        ? state.waitingForOtherRun
          ? '기존 작업의 대상은 변경하지 않았습니다. 작업이 끝난 뒤 이번에 추가한 저장소만 다시 요청할 수 있습니다.'
          : state.consentRequired
            ? '현재 AI 전송 동의를 확인해야 합니다. 프로젝트 목록의 분석 새로고침에서 동의를 확인해주세요. 연결된 저장소는 유지됩니다.'
            : '분석을 시작하지 못했습니다. 연결된 저장소는 유지되며 다시 요청할 수 있습니다.'
        : status === 'QUEUED' || status === 'RUNNING'
          ? '서버에서 확인한 상태입니다. 분석 상태는 자동으로 갱신됩니다.'
          : !project?.specDocument
            ? '프로젝트 공통 PDF를 등록하면 기능 항목을 추출할 수 있습니다. 명세서 없이도 PR 목록을 사용할 수 있습니다.'
            : '저장소별 수집 상태와 PR 요약 결과를 확인하세요.'
  return (
    <AppShell
      header={<AppHeader />}
      sidebar={
        <Sidebar
          activeId={tab}
          backLink={<Link to="/projects">← 모든 프로젝트</Link>}
          items={[
            {
              id: 'home',
              label: '프로젝트 개요',
              href: `/project/${projectId}`,
            },
            {
              id: 'prs',
              label: 'PR 목록',
              href: `/project/${projectId}?tab=prs`,
            },
            {
              id: 'spec',
              label: '기능명세서',
              href: `/project/${projectId}?tab=spec`,
            },
          ]}
          footer={
            <div className="space-y-1">
              <p className="font-bold">
                연결된 저장소 {project?.repositories.length ?? '—'}개
              </p>
              {project?.repositories.map((repo) => (
                <p
                  key={repo.repositoryId}
                  title={repo.fullName}
                  className="truncate font-mono"
                >
                  {repo.fullName}
                </p>
              ))}
              <p>기능대조 · 준비 중</p>
            </div>
          }
        />
      }
    >
      <div className="flex max-w-[1220px] flex-col gap-5">
        {tab === 'prs' && project ? (
          <ProjectPullRequests
            project={project}
            data={overview.data}
            refresh={overview.refresh}
          />
        ) : tab === 'spec' && project ? (
          <ProjectSpecification project={project} />
        ) : (
          <>
            <SectionHeader
              level={1}
              title={project?.name ?? '프로젝트'}
              description={
                <>
                  마지막 분석 {displayDate(project?.lastAnalysis?.requestedAt)}
                </>
              }
              action={
                <Button
                  disabled={requesting || unknown}
                  onClick={() =>
                    navigate(`/projects/${projectId}/repositories`)
                  }
                >
                  ＋ 저장소 추가
                </Button>
              }
            />
            <section
              aria-label="현재 분석 상태"
              aria-live="polite"
              className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center rounded-xl border border-[#c6cef0] bg-[#f6f8fe] px-5 py-4"
            >
              <div className="min-w-0 w-full sm:flex-1">
                <p className="text-xs font-extrabold text-primary">현재 상태</p>
                <h2 className="mt-1 text-[16px] font-extrabold">
                  {showFailures
                    ? `${failedRepos}개 저장소에 분석 실패 PR이 있습니다`
                    : title}
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  {showFailures
                    ? '실패 원인을 확인하고 실패한 PR만 다시 분석할 수 있습니다. 성공한 결과는 유지됩니다.'
                    : description}
                </p>
              </div>
              {rejected && !state.consentRequired ? (
                <Button onClick={() => projectAnalysis.retry(projectId)}>
                  분석 다시 요청
                </Button>
              ) : showFailures ? (
                <Button
                  onClick={() =>
                    navigate(`/project/${projectId}?tab=prs&status=FAILED`)
                  }
                >
                  PR 목록 열기 →
                </Button>
              ) : !requesting &&
                !unknown &&
                !rejected &&
                !state.awaitingRun &&
                !['QUEUED', 'RUNNING'].includes(status ?? '') &&
                !project?.specDocument ? (
                <Button onClick={openSpec}>명세서 등록하기 →</Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    void projectAnalysis.refresh(projectId)
                    overview.refresh()
                  }}
                >
                  상태 확인
                </Button>
              )}
            </section>
            {state.error && <Alert tone="warning">{state.error}</Alert>}
            {!!state.excluded && (
              <Alert tone="warning">
                접근할 수 없는 저장소 {state.excluded}개는 이번 분석에서
                제외됩니다.
              </Alert>
            )}
            {!project ? (
              <p role="status" className="py-8 text-center text-muted">
                프로젝트를 불러오고 있습니다…
              </p>
            ) : (
              <>
                <h2 className="text-[15.5px] font-extrabold">핵심 현황</h2>
                <div className="grid gap-3 sm:max-w-[740px] sm:grid-cols-3">
                  <StatCard
                    label="분석된 PR"
                    value={overview.data?.completed ?? '—'}
                    hint="요약 완료 기준"
                  />
                  <StatCard
                    label="확인 필요"
                    value={
                      overview.data?.overview ? (
                        overview.data.overview.failedCount ? (
                          <span className="text-danger">
                            실패 {overview.data.overview.failedCount}건
                          </span>
                        ) : (
                          '없음'
                        )
                      ) : (
                        '—'
                      )
                    }
                    hint="요약 실패 PR"
                  />
                  <StatCard
                    label="대조된 기능"
                    value="—"
                    hint="기능대조 준비 중"
                  />
                </div>
                {overview.loading && !overview.data && (
                  <p role="status" className="text-sm text-muted">
                    PR 현황을 불러오고 있습니다…
                  </p>
                )}
                {overview.data?.partial && (
                  <Alert
                    tone="warning"
                    action={
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={overview.refresh}
                      >
                        다시 조회
                      </Button>
                    }
                  >
                    일부 현황을 불러오지 못했습니다. 확인되지 않은 수치는 —로
                    표시합니다.
                  </Alert>
                )}
                <ProjectRepositoryCards
                  project={project}
                  data={overview.data}
                  refresh={overview.refresh}
                  busy={
                    requesting ||
                    unknown ||
                    ['QUEUED', 'RUNNING'].includes(status ?? '')
                  }
                />
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
