import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Badge, Button } from '../../components/ui'
import {
  connectPullRequest,
  disconnectPullRequest,
  getMatchDetail,
  MatchApiError,
  MatchOutcomeUnknown,
  MatchRunChanged,
} from './api'
import type { ProjectDetail } from '../projects/api'
import { githubUrl } from '../../lib/format'
import { matchKeys } from './keys'
import { EmbeddedPrDetail } from './EmbeddedPrDetail'
import { PrPicker } from './PrPicker'

export function EvidencePanel({
  featureId,
  runId,
  projectId,
  repositories,
}: {
  featureId: number
  runId: number
  projectId: number
  repositories: ProjectDetail['repositories']
}) {
  const queryClient = useQueryClient()
  const detailQuery = useQuery({
    queryKey: matchKeys.detail(projectId, runId, featureId),
    queryFn: async ({ signal }) => {
      const data = await getMatchDetail(featureId, signal)
      if (data.featureMatchRunId !== runId) throw new MatchRunChanged()
      return data
    },
  })
  const detail = detailQuery.data ?? null
  const error = !detailQuery.isError
    ? ''
    : detailQuery.error instanceof MatchRunChanged
      ? '대조 결과가 변경되었습니다. 목록을 다시 확인해주세요.'
      : '기능별 근거를 불러오지 못했습니다.'
  // Connections changed: the list counts, this detail and the unmatched PRs
  // are all re-read. Data already on screen stays until each read lands.
  const refreshMatch = () =>
    void queryClient.invalidateQueries({
      queryKey: matchKeys.all(projectId),
    })
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [selectedPrId, setSelectedPrId] = useState<number | null>(null)
  // A stale detail must not offer an unlink for a match that may be gone.
  const stale = detailQuery.isFetching
  const change = async (action: () => Promise<unknown>) => {
    if (busy || uncertain) return
    setBusy(true)
    setNotice('')
    try {
      await action()
      setLinkOpen(false)
      refreshMatch()
    } catch (caught) {
      if (caught instanceof MatchOutcomeUnknown) {
        setUncertain(true)
        setNotice(caught.message)
      } else if (
        caught instanceof MatchApiError &&
        caught.code === 'FEATURE-MATCH-008'
      ) {
        setNotice('이미 연결된 PR입니다. 최신 결과를 확인해주세요.')
      } else {
        setNotice('PR 연결을 변경하지 못했습니다. 최신 결과를 확인해주세요.')
      }
      refreshMatch()
    } finally {
      setBusy(false)
    }
  }
  if (selectedPrId !== null)
    return (
      <EmbeddedPrDetail
        id={selectedPrId}
        repositoryIds={repositories.map((repo) => repo.repositoryId)}
        onBack={() => setSelectedPrId(null)}
      />
    )
  return (
    <section
      className="min-w-0 overflow-hidden rounded-[14px] border border-line bg-surface"
      aria-label="선택한 기능의 근거"
    >
      <header className="border-b border-line px-5 py-4 sm:px-6">
        <h3 className="break-words text-[17px] font-extrabold">
          {detail?.name ?? '기능별 관련 PR'}
        </h3>
        {detail?.sourcePageStart && (
          <p className="mt-1 text-xs text-faint">
            원문 p.{detail.sourcePageStart}
            {detail.sourcePageEnd &&
            detail.sourcePageEnd !== detail.sourcePageStart
              ? `–${detail.sourcePageEnd}`
              : ''}
          </p>
        )}
      </header>
      <div className="p-5 sm:p-6">
        {error ? (
          <Alert
            tone="warning"
            action={
              <Button
                size="sm"
                variant="secondary"
                loading={detailQuery.isFetching}
                onClick={() => void detailQuery.refetch()}
              >
                다시 불러오기
              </Button>
            }
          >
            {error}
          </Alert>
        ) : !detail ? (
          <p role="status">근거를 불러오는 중입니다…</p>
        ) : (
          <div className="space-y-5 text-[13px]">
            {detail.reviewStatus === 'UNREVIEWED' && (
              <Badge tone="warning">기능 미검토</Badge>
            )}
            {notice && <Alert tone="warning">{notice}</Alert>}
            <section className="space-y-3">
              <h4 className="text-sm font-extrabold">
                세부 요구사항 {detail.requirements.length}개
              </h4>
              {detail.requirements.length ? (
                <ul className="space-y-2">
                  {detail.requirements.map((r) => (
                    <li
                      key={r.requirementId}
                      className="flex gap-2 break-words leading-relaxed text-body"
                    >
                      <span aria-hidden="true" className="text-primary">
                        ·
                      </span>
                      {r.content}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">등록된 세부 요구사항이 없습니다.</p>
              )}
            </section>
            <section className="space-y-4 border-t border-line pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-extrabold">
                  관련 PR {detail.relatedPullRequestCount}개
                </h4>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || uncertain || stale}
                  onClick={() => setLinkOpen(true)}
                >
                  이 기능에 PR 직접 연결
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-muted">
                AI가 찾은 PR과 직접 연결한 PR을 구분해 표시합니다. 근거만으로
                구현 완료를 판단할 수 없습니다.
              </p>
              {detail.evidenceStatus === 'NO_EVIDENCE' && (
                <Alert tone="warning">
                  이 기능에 연결된 PR 근거가 없습니다.
                </Alert>
              )}
              {detail.repositories.map((repo) => (
                <section
                  key={repo.repositoryId}
                  className="overflow-hidden rounded-xl border border-line"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-subtle px-4 py-3">
                    <h5 className="break-all font-extrabold">
                      {repo.fullName}
                    </h5>
                    <Badge tone="neutral">
                      관련 PR {repo.pullRequests.length}개
                    </Badge>
                  </div>
                  <div className="space-y-3 p-3">
                    {repo.pullRequests.map((match) => (
                      <div
                        key={match.matchId}
                        className="space-y-2 rounded-lg border border-line bg-surface p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="break-words text-left font-bold text-primary underline"
                            onClick={() =>
                              setSelectedPrId(match.pullRequest.pullRequestId)
                            }
                          >
                            #{match.pullRequest.number}{' '}
                            {match.pullRequest.title}
                          </button>
                          <Badge
                            tone={
                              match.source === 'USER' ? 'accent' : 'neutral'
                            }
                          >
                            {match.source === 'USER'
                              ? '사용자 연결'
                              : 'AI 연결'}
                          </Badge>
                          {match.pullRequest.dataCompleteness === 'PARTIAL' && (
                            <Badge tone="warning">일부 데이터만 수집</Badge>
                          )}
                        </div>
                        {match.reason && (
                          <p className="break-words leading-relaxed text-body">
                            {match.reason}
                          </p>
                        )}
                        {!!match.matchedRequirements.length && (
                          <p className="break-words text-muted">
                            연결된 요구사항:{' '}
                            {match.matchedRequirements
                              .map((r) => r.content)
                              .join(' · ')}
                          </p>
                        )}
                        {match.pullRequest.analysisSummary && (
                          <p className="break-words text-muted">
                            PR 요약: {match.pullRequest.analysisSummary}
                          </p>
                        )}
                        {githubUrl(match.pullRequest.htmlUrl) && (
                          <a
                            href={githubUrl(match.pullRequest.htmlUrl)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block font-bold text-primary underline"
                          >
                            GitHub에서 보기 ↗
                          </a>
                        )}
                        {match.source === 'USER' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy || uncertain || stale}
                            onClick={() =>
                              void change(() =>
                                disconnectPullRequest(match.matchId),
                              )
                            }
                          >
                            연결 해제
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              {linkOpen && (
                <PrPicker
                  projectId={projectId}
                  repositories={repositories}
                  linkedIds={
                    new Set(
                      detail.repositories.flatMap((repo) =>
                        repo.pullRequests.map(
                          (match) => match.pullRequest.pullRequestId,
                        ),
                      ),
                    )
                  }
                  onClose={() => setLinkOpen(false)}
                  onConnect={(pullRequestIds) =>
                    void change(() =>
                      connectPullRequest(detail.featureId, pullRequestIds),
                    )
                  }
                  busy={busy}
                  blocked={uncertain}
                />
              )}
            </section>
          </div>
        )}
      </div>
    </section>
  )
}
