import { useEffect, useSyncExternalStore } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { projectAnalysis } from '../analysis/projectAnalysis'
import { AppHeader, AppShell, Sidebar } from '../components/layout'
import { AnalysisStatusBadge } from '../components/AnalysisStatusBadge'
import {
  Alert,
  Badge,
  Button,
  Card,
  SectionHeader,
  StatCard,
} from '../components/ui'
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
  const title = requesting
    ? '분석 요청 중'
    : unknown
      ? '분석 접수 여부를 확인하고 있습니다'
      : rejected
        ? state.preflightFailed
          ? '분석 요청을 준비하지 못했습니다'
          : '분석 요청이 거절되었습니다'
        : status === 'RUNNING'
          ? '분석 중'
          : status === 'QUEUED'
            ? '분석 대기 중'
            : state.phase === 'confirmed' && !status
              ? '분석 요청이 접수되었습니다'
              : '프로젝트 분석 현황'
  const description = requesting
    ? '저장소가 연결되었습니다. 서버가 분석 요청을 접수하는 중입니다.'
    : unknown
      ? '응답을 확인하지 못했습니다. 중복 분석을 방지하기 위해 서버 상태만 확인합니다.'
      : rejected
        ? state.consentRequired
          ? '현재 AI 전송 동의를 확인해야 합니다. 프로젝트 목록의 분석 새로고침에서 동의를 확인해주세요. 연결된 저장소는 유지됩니다.'
          : '분석을 시작하지 못했습니다. 연결된 저장소는 유지되며 다시 요청할 수 있습니다.'
        : status === 'QUEUED' || status === 'RUNNING'
          ? '서버에서 확인한 상태입니다. 분석 상태는 자동으로 갱신됩니다.'
          : '기능명세서와 GitHub 저장소의 분석 상태를 확인하세요.'
  return (
    <AppShell
      header={
        <AppHeader
          context={project?.name ?? '프로젝트'}
          actions={
            <Link to="/projects" className="text-[13px] font-bold">
              모든 프로젝트
            </Link>
          }
        />
      }
      sidebar={
        <Sidebar
          activeId="home"
          backLink={<Link to="/projects">← 모든 프로젝트</Link>}
          items={[
            { id: 'home', label: '프로젝트 홈', href: `/project/${projectId}` },
            {
              id: 'repositories',
              label: '연결된 저장소',
              href: '#repositories',
            },
            { id: 'spec', label: '기능명세서', href: '#spec' },
          ]}
          footer={`연결된 저장소 ${project?.repositories.length ?? '—'}개`}
        />
      }
    >
      <div className="mx-auto flex max-w-[1020px] flex-col gap-5">
        <SectionHeader
          level={1}
          title={project?.name ?? '프로젝트'}
          description="개발 작업과 기능 구현 현황을 파악하는 프로젝트 공간"
        />
        <section
          aria-label="현재 분석 상태"
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#c6cef0] bg-[#f6f8fe] px-5 py-4"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold text-primary">현재 상태</p>
            <h2 className="mt-1 text-[16px] font-extrabold">{title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {description}
            </p>
          </div>
          {rejected && !state.consentRequired ? (
            <Button onClick={() => projectAnalysis.retry(projectId)}>
              분석 다시 요청
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => void projectAnalysis.refresh(projectId)}
            >
              상태 확인
            </Button>
          )}
        </section>
        {state.error && <Alert tone="warning">{state.error}</Alert>}
        {!!state.excluded && (
          <Alert tone="warning">
            접근할 수 없는 저장소 {state.excluded}개는 이번 분석에서 제외됩니다.
          </Alert>
        )}
        {!project ? (
          <p role="status" className="py-8 text-center text-muted">
            프로젝트를 불러오고 있습니다…
          </p>
        ) : (
          <>
            <h2 className="text-[15.5px] font-extrabold">핵심 현황</h2>
            <div className="grid gap-3 sm:max-w-[700px] sm:grid-cols-3">
              <StatCard
                label="연결된 저장소"
                value={project.repositories.length}
              />
              <StatCard
                label="기능명세서"
                value={project.specDocument ? '등록됨' : '미등록'}
              />
              <StatCard
                label="최근 분석"
                value={
                  requesting ? (
                    <Badge tone="info">분석 요청 중</Badge>
                  ) : unknown ? (
                    <Badge tone="warning">접수 확인 중</Badge>
                  ) : state.awaitingRun ? (
                    <Badge tone="info">분석 접수됨</Badge>
                  ) : (
                    <AnalysisStatusBadge status={status} />
                  )
                }
              />
            </div>
            <section id="repositories" className="space-y-3 scroll-mt-5">
              <h2 className="text-[15.5px] font-extrabold">연결된 저장소</h2>
              {project.repositories.length === 0 && (
                <Card>연결된 저장소가 없습니다.</Card>
              )}
              {project.repositories.map((repo) => (
                <Card
                  key={repo.repositoryId}
                  className="flex flex-wrap items-center gap-4"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-bg font-bold text-muted"
                  >
                    {repo.fullName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="break-all font-mono text-[13.5px] font-bold">
                      {repo.fullName}
                    </h3>
                    <a
                      className="mt-1 inline-block text-xs text-muted underline"
                      href={`https://github.com/${repo.fullName.split('/').map(encodeURIComponent).join('/')}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      GitHub에서 보기 ↗
                    </a>
                  </div>
                  <Badge tone="success">연결됨</Badge>
                </Card>
              ))}
            </section>
            <section id="spec" className="scroll-mt-5">
              <Card>
                <h2 className="text-[15px] font-extrabold">기능명세서</h2>
                <p className="mt-2 break-words text-[13px] text-muted">
                  {project.specDocument?.fileName ??
                    '등록된 기능명세서가 없습니다.'}
                </p>
              </Card>
            </section>
          </>
        )}
      </div>
    </AppShell>
  )
}
