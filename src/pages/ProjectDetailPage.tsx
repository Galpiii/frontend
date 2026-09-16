import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { SessionError } from '../auth/session'
import { AppHeader, AppShell } from '../components/layout'
import { Alert, Button, Card, SectionHeader } from '../components/ui'
import { getProjectDetail, type ProjectDetail } from '../lib/projectApi'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { NewProjectPage } from './NewProjectPage'
import { resumeOnboardingStep } from './onboardingSteps'

export function ProjectDetailPage() {
  const { projectId } = useParams()
  const id = Number(projectId)
  if (!Number.isSafeInteger(id) || id <= 0)
    return <Navigate to="/projects" replace />
  return <ProjectEntry key={id} projectId={id} />
}

function ProjectEntry({ projectId }: { projectId: number }) {
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useDocumentTitle(project?.name ?? '프로젝트')

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const data = await getProjectDetail(projectId, controller.signal)
        if (!controller.signal.aborted) setProject(data)
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof SessionError && cause.status === 401) return
        setError(
          cause instanceof Error
            ? cause.message
            : '프로젝트 정보를 불러오지 못했습니다.',
        )
      }
    }
    void load()
    return () => controller.abort()
  }, [projectId, attempt])

  if (project) {
    const step = resumeOnboardingStep(project)
    if (step === 'SPEC') return <NewProjectPage project={project} />
    if (step === 'REPOSITORIES')
      return <Navigate to={`/projects/${project.id}/repositories`} replace />
  }

  return (
    <AppShell header={<AppHeader context="프로젝트" />}>
      <div className="mx-auto flex max-w-[880px] flex-col gap-4">
        <Link to="/projects" className="self-start text-[13.5px] font-bold">
          ← 프로젝트 목록
        </Link>
        {error ? (
          <Alert
            tone="danger"
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
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
        ) : !project ? (
          <Card>
            <p role="status" className="py-8 text-center text-muted">
              프로젝트를 불러오고 있습니다…
            </p>
          </Card>
        ) : (
          <>
            <SectionHeader
              level={1}
              title={project.name}
              description="프로젝트에 등록한 명세서와 저장소를 확인하세요."
            />
            <Card>
              <h2 className="text-[15px] font-extrabold">기능명세서</h2>
              <p className="mt-2 break-words text-[13px] text-muted">
                {project.specDocument?.fileName ??
                  '등록된 기능명세서가 없습니다.'}
              </p>
            </Card>
            <Card>
              <h2 className="text-[15px] font-extrabold">
                연결된 저장소 {project.repositories.length}개
              </h2>
              <ul className="mt-2 space-y-2">
                {project.repositories.map((repo) => (
                  <li
                    key={repo.repositoryId}
                    className="break-words font-mono text-[13px] text-muted"
                  >
                    {repo.fullName}
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  )
}
