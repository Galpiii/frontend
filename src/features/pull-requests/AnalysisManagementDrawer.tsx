import { useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Alert, Badge, Button, Card, Drawer } from '../../components/ui'
import { AiConsentModal } from '../consent/AiConsentModal'
import { useAnalysisStart } from '../consent/useAnalysisStart'
import { projectAnalysis } from '../projects/projectAnalysis'
import { prRetry } from './prRetry'
import { getPrOverview, type loadOverview } from '../projects/overviewApi'
import { failureReasons, getPrPage } from './api'
import { pullRequestKeys } from './keys'
import type { ProjectDetail } from '../projects/api'

export function AnalysisManagementDrawer({
  project,
  data,
  refresh,
  onRepository,
  onClose,
}: {
  project: ProjectDetail
  data: Awaited<ReturnType<typeof loadOverview>> | null
  refresh: () => void
  onRepository: (id: number) => void
  onClose: () => void
}) {
  const consent = useAnalysisStart()
  const navigate = useNavigate()
  const retry = useSyncExternalStore(prRetry.subscribe, () =>
    prRetry.get(project.id),
  )
  const analysis = useSyncExternalStore(projectAnalysis.subscribe, () =>
    projectAnalysis.get(project.id),
  )
  const [error, setError] = useState('')
  const failedCount = data?.overview?.failedCount
  // Keyed by the failure count, so a changed overview re-reads the reasons.
  const failedOptions = { analysisStatus: 'FAILED', size: 10, failedCount }
  const failedQuery = useQuery({
    queryKey: pullRequestKeys.list(project.id, failedOptions),
    queryFn: ({ signal }) =>
      getPrPage(project.id, { analysisStatus: 'FAILED', size: 10 }, signal),
    placeholderData: keepPreviousData,
  })
  const failed = failedQuery.data ?? null
  const busy = consent.state.phase !== 'idle' || retry.phase === 'requesting'
  const collecting =
    ['queued', 'requesting', 'unknown'].includes(analysis.phase) ||
    ['QUEUED', 'RUNNING'].includes(project.lastAnalysis?.status ?? '')
  async function checkStatus() {
    setError('')
    try {
      const latest = await getPrOverview(project.id)
      prRetry.allowAfterStatus(project.id, latest.pendingCount)
      refresh()
    } catch {
      setError('상태를 확인하지 못했습니다. 재요청하지 않고 다시 조회해주세요.')
    }
  }
  async function request(kind: 'failed' | 'collect') {
    if (busy || consent.flow.state.phase !== 'idle') return
    setError('')
    try {
      if (!(await consent.flow.requestConsent()) || consent.flow.disposed)
        return
      if (kind === 'failed') {
        await prRetry.request(project.id)
        refresh()
      } else {
        projectAnalysis.queue(project.id)
        void projectAnalysis.consume(project.id)
        onClose()
        navigate(`/projects/${project.id}`)
      }
    } catch {
      setError('동의 정보를 확인하지 못했습니다. 다시 시도해주세요.')
    }
  }
  return (
    <>
      <Drawer
        open
        title="분석 관리"
        description="수집 기준과 저장소별 처리 상태를 확인합니다."
        onClose={onClose}
        closeDisabled={busy}
      >
        <div className="space-y-4">
          {!!failedCount && (
            <Alert
              tone="warning"
              title="일부 저장소에 분석하지 못한 PR이 있습니다."
            >
              <ul className="my-3 space-y-1">
                {failed?.pullRequests.map((pr) => (
                  <li key={pr.id} className="break-words">
                    {pr.repository.fullName} — #{pr.number}{' '}
                    {failureReasons[pr.analysis?.errorCode ?? ''] ??
                      pr.analysis?.errorCode ??
                      '상세에서 실패 사유를 확인해주세요.'}
                  </li>
                ))}
              </ul>
              {failed && failed.totalElements > failed.pullRequests.length && (
                <p className="mb-3">
                  실패 {failed.totalElements}개 중 {failed.pullRequests.length}
                  개 표시
                </p>
              )}
              <Button
                disabled={
                  busy || retry.phase === 'unknown' || retry.phase === 'success'
                }
                loading={retry.phase === 'requesting'}
                onClick={() => void request('failed')}
              >
                실패한 PR만 다시 분석
              </Button>
            </Alert>
          )}
          {retry.message && (
            <Alert
              tone={
                retry.phase === 'unknown' || retry.phase === 'rejected'
                  ? 'warning'
                  : 'info'
              }
            >
              {retry.message}
            </Alert>
          )}
          {failedQuery.isError && (
            <Alert tone="warning">
              실패한 PR의 상세 사유를 불러오지 못했습니다.
            </Alert>
          )}
          {error && <Alert tone="warning">{error}</Alert>}
          <Card>
            <h3 className="font-bold">수집 기준</h3>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="mb-2 text-muted">PR 상태</dt>
                <dd>
                  <Badge tone="neutral">Merge됨</Badge>
                </dd>
              </div>
              <div>
                <dt className="mb-1 text-muted">Base Branch</dt>
                <dd>각 저장소 기본 브랜치</dd>
              </div>
              <div>
                <dt className="mb-2 text-muted">분석 기간</dt>
                <dd>
                  <Badge tone="neutral">전체 기간</Badge>
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted">
              현재 수집 기준은 고정되어 있습니다. Open·Closed PR이나 기간 변경은
              지원하지 않습니다.
            </p>
            <div className="mt-5 border-t border-line pt-4">
              <Button
                disabled={
                  busy || collecting || project.repositories.length === 0
                }
                onClick={() => void request('collect')}
              >
                전체 저장소 수집 새로고침
              </Button>
              <p className="mt-2 text-xs text-muted">
                전체 저장소를 다시 수집합니다. 변경 없는 PR 요약은 유지됩니다.
              </p>
            </div>
          </Card>
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[440px] text-left text-[12px]">
              <caption className="sr-only">저장소별 PR 분석 현황</caption>
              <thead className="bg-subtle text-faint">
                <tr>
                  {['저장소', '전체', '성공', '실패', '상태', ''].map(
                    (h, i) => (
                      <th key={i} className="px-3 py-3 font-bold">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {project.repositories.map((repo) => {
                  const counts = data?.overview?.repositories.find(
                    (r) => r.id === repo.repositoryId,
                  )
                  return (
                    <tr
                      key={repo.repositoryId}
                      className="border-t border-line"
                    >
                      <th
                        scope="row"
                        className="max-w-[150px] break-words px-3 py-4 font-mono"
                      >
                        {repo.fullName}
                      </th>
                      <td className="px-3">
                        {counts?.pullRequestCount ?? '—'}
                      </td>
                      <td className="px-3">
                        {data?.repositoryCompleted[repo.repositoryId] ?? '—'}
                      </td>
                      <td className="px-3 text-danger">
                        {counts?.failedCount ?? '—'}
                      </td>
                      <td className="px-3">
                        <Badge
                          tone={counts?.failedCount ? 'warning' : 'neutral'}
                        >
                          {counts
                            ? counts.failedCount
                              ? '확인 필요'
                              : '실패 없음'
                            : '미확인'}
                        </Badge>
                      </td>
                      <td className="px-3">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onRepository(repo.repositoryId)}
                        >
                          PR 보기
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void checkStatus()
            }}
          >
            상태 다시 확인
          </Button>
          <p className="text-xs leading-relaxed text-muted">
            성공 건수는 기능 구현률을 뜻하지 않습니다. PR 제외 기능은 아직
            지원하지 않습니다.
          </p>
        </div>
      </Drawer>
      <AiConsentModal flow={consent.flow} state={consent.state} />
    </>
  )
}
