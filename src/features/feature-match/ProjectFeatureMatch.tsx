import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMatchOwner } from './matchOwner'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChip,
  Input,
  Modal,
  Progress,
} from '../../components/ui'
import { BrandMark } from '../../components/layout'
import { getFeatureReviewSummary } from '../feature-review/api'
import {
  getMatchResults,
  MatchApiError,
  type MatchFilter,
  MatchRunChanged,
} from './api'
import type { ProjectDetail } from '../projects/api'
import { matchKeys } from './keys'
import { usePolling } from '../../lib/usePolling'
import { EvidencePanel } from './EvidencePanel'
import { UnmatchedModal } from './UnmatchedModal'

const filters: { value: MatchFilter; label: string }[] = [
  { value: 'ALL', label: '전체 기능' },
  { value: 'EVIDENCE_FOUND', label: '관련 PR 있음' },
  { value: 'ATTENTION_REQUIRED', label: '확인 필요' },
]

const settledRun = (status?: string) =>
  status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED'

export function ProjectFeatureMatch({
  project,
  onStartConsent,
}: {
  project: ProjectDetail
  onStartConsent: () => Promise<boolean>
}) {
  const owner = getMatchOwner(project.id)
  const state = useSyncExternalStore(owner.subscribe, owner.getSnapshot)
  const [params, setParams] = useSearchParams()
  const rawFilter = params.get('matchFilter')
  const filter: MatchFilter =
    rawFilter === 'EVIDENCE_FOUND' || rawFilter === 'ATTENTION_REQUIRED'
      ? rawFilter
      : 'ALL'
  const repoId = Number(params.get('matchRepo')) || undefined
  const q = params.get('matchQ') ?? ''
  const detailId = Number(params.get('matchFeature')) || null
  const queryClient = useQueryClient()
  const [search, setSearch] = useState(q)
  const [actionError, setActionError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [unreviewed, setUnreviewed] = useState<number | null>(null)
  const [starting, setStarting] = useState(false)
  const [showUnmatched, setShowUnmatched] = useState(false)
  const evidenceRef = useRef<HTMLDivElement>(null)
  const runId = state.run?.featureMatchRunId
  const runStatus = state.run?.status
  const staleSpec = Boolean(
    state.run &&
    state.run.specDocumentId !== project.specDocument?.specDocumentId,
  )
  const readable = !staleSpec && !!runId && settledRun(runStatus)
  const unfiltered = filter === 'ALL' && !repoId && !q
  const resultsFor = (
    filter: MatchFilter,
    repositoryId?: number,
    search?: string,
  ) => ({
    queryKey: matchKeys.results(
      project.id,
      runId ?? 0,
      runStatus ?? '',
      filter,
      repositoryId,
      search,
    ),
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const data = await getMatchResults(
        project.id,
        filter,
        repositoryId,
        search,
        signal,
      )
      if (data.featureMatchRunId !== runId) throw new MatchRunChanged()
      return data
    },
  })
  // A refetch of the same view keeps its results on screen, so the evidence
  // panel and its notices survive a PR (dis)connect; a new view starts empty.
  const resultsQuery = useQuery({
    ...resultsFor(filter, repoId, q),
    enabled: readable,
  })
  // Summary counts always describe the whole run, whatever the filter.
  const allQuery = useQuery({
    ...resultsFor('ALL', undefined, ''),
    enabled: readable && !unfiltered,
  })
  const results = readable ? (resultsQuery.data ?? null) : null
  const allResults = unfiltered ? results : (allQuery.data ?? null)
  const error = !resultsQuery.isError
    ? ''
    : resultsQuery.error instanceof MatchRunChanged
      ? '대조 실행이 변경되었습니다. 다시 확인해주세요.'
      : resultsQuery.error instanceof MatchApiError &&
          resultsQuery.error.code === 'FEATURE-MATCH-010'
        ? '명세서나 저장소가 변경되어 결과가 오래되었습니다. 최신 상태를 확인해주세요.'
        : '기능대조 결과를 불러오지 못했습니다.'
  const reloadingResults = resultsQuery.isRefetching
  const refreshResults = () =>
    void queryClient.invalidateQueries({
      queryKey: matchKeys.all(project.id),
    })
  const latestParams = useRef(params)
  useEffect(() => {
    latestParams.current = params
  }, [params])
  useEffect(() => {
    void owner.refresh()
  }, [owner])
  usePolling(() => void owner.refresh(), 5000)
  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(latestParams.current)
    Object.entries(patch).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    )
    latestParams.current = next
    setParams(next, { replace: true })
  }
  const promptStart = async () => {
    if (state.phase !== 'idle' || starting) return
    setStarting(true)
    setActionError('')
    try {
      const summary = await getFeatureReviewSummary(
        project.specDocument!.specDocumentId!,
      )
      setUnreviewed(summary.reviewRequired + summary.noIssue)
      setConfirmOpen(true)
    } catch {
      setActionError('검토 상태를 확인하지 못했습니다. 다시 시도해주세요.')
    } finally {
      setStarting(false)
    }
  }
  const start = async () => {
    if (starting || state.phase !== 'idle') return
    setConfirmOpen(false)
    setStarting(true)
    try {
      if (await onStartConsent())
        await owner.start(project.specDocument!.specDocumentId!)
    } catch {
      setActionError('동의 상태를 확인하지 못했습니다. 다시 시도해주세요.')
    } finally {
      setStarting(false)
    }
  }
  const run = state.run
  const active = state.phase === 'sending' || state.phase === 'running'
  const summary = allResults?.summary ?? results?.summary
  const allFeatures = allResults?.sections.flatMap(
    (section) => section.features,
  )
  const manualFeatureCount = allFeatures?.every(
    (feature) => typeof feature.manualMatchCount === 'number',
  )
    ? allFeatures.filter((feature) => (feature.manualMatchCount ?? 0) > 0)
        .length
    : null
  const visibleFeatures =
    results?.sections.flatMap((section) => section.features) ?? []
  const selectedFeature =
    visibleFeatures.find((feature) => feature.featureId === detailId) ??
    visibleFeatures[0]
  const selectedFeatureId = selectedFeature?.featureId
  const scrollToFeature = useRef(detailId !== null)
  useEffect(() => {
    if (!scrollToFeature.current || selectedFeatureId !== detailId) return
    scrollToFeature.current = false
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-feature-id="${selectedFeatureId}"]`)
        ?.scrollIntoView({ block: 'nearest' })
      if (window.matchMedia('(max-width: 1279px)').matches)
        evidenceRef.current?.scrollIntoView({ block: 'start' })
    })
  }, [selectedFeatureId, detailId])
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-extrabold">기능과 PR 대조</h2>
            <p className="mt-1 text-[13px] text-muted">
              추출한 기능과 연결된 저장소의 PR에서 관련 근거를 찾습니다.
            </p>
          </div>
          <Button
            disabled={state.phase !== 'idle' || starting}
            loading={starting}
            onClick={() => void promptStart()}
          >
            {staleSpec
              ? '현재 명세서로 대조'
              : run
                ? '전체 다시 대조'
                : '기능대조 시작'}
          </Button>
        </div>
        {active && (
          <>
            <Alert tone="info">
              {state.phase === 'sending'
                ? '기능대조 요청 중입니다.'
                : run?.status === 'QUEUED'
                  ? '기능대조 대기 중입니다.'
                  : '기능대조가 진행 중입니다.'}
            </Alert>
            {run && (
              <Progress label="기능대조 진행률" value={run.progressPercent} />
            )}
          </>
        )}
        {state.phase === 'unknown' && (
          <Alert
            tone="warning"
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void owner.refresh()}
              >
                상태 다시 확인
              </Button>
            }
          >
            {state.message ||
              '요청 결과가 불확실합니다. 중복 요청을 막고 서버 상태를 확인합니다.'}
          </Alert>
        )}
        {state.phase === 'read-error' && (
          <Alert
            tone="warning"
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void owner.refresh()}
              >
                상태 다시 확인
              </Button>
            }
          >
            {state.message}
          </Alert>
        )}
        {state.startError && <Alert tone="warning">{state.startError}</Alert>}
        {state.phase === 'loading' && (
          <p role="status" className="text-[13px] text-muted">
            서버의 최신 실행 상태를 확인하고 있습니다…
          </p>
        )}
        {staleSpec && (
          <Alert tone="warning">
            최근 실행은 이전 기능명세서를 기준으로 합니다. 현재 명세서의 결과를
            보려면 기능대조를 다시 실행해주세요.
          </Alert>
        )}
        {state.phase === 'idle' &&
          run &&
          ['FAILED', 'CANCELLED'].includes(run.status) && (
            <Alert tone="warning">
              최근 실행이 {run.status === 'FAILED' ? '실패' : '취소'}되었습니다.
              {run.failureCode ? ` 원인: ${run.failureCode}` : ''}
            </Alert>
          )}
        {state.phase === 'idle' && run?.status === 'PARTIALLY_COMPLETED' && (
          <Alert tone="warning">
            일부 PR을 대조하지 못했습니다. 성공한 대상의 근거만 표시합니다. 실패{' '}
            {run.failedCount}건 · 취소 {run.cancelledCount}건
          </Alert>
        )}
      </Card>
      {actionError && <Alert tone="warning">{actionError}</Alert>}
      {state.phase === 'idle' && !run && (
        <EmptyState
          icon={<BrandMark />}
          title="아직 기능대조를 실행하지 않았습니다"
          description="기능 검토를 마친 뒤 실행할 수 있습니다. 검토하지 않은 기능이 있어도 대조는 가능합니다."
        />
      )}
      {state.phase === 'idle' &&
        run &&
        !staleSpec &&
        ['COMPLETED', 'PARTIALLY_COMPLETED'].includes(run.status) && (
          <>
            {error && (
              <Alert
                tone="warning"
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      refreshResults()
                      void owner.refresh()
                    }}
                  >
                    다시 불러오기
                  </Button>
                }
              >
                {error}
              </Alert>
            )}
            {summary && (
              <div
                className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
                aria-label="기능대조 요약"
              >
                <Card className="space-y-1">
                  <p className="text-[26px] font-extrabold leading-none">
                    {summary.matchedPullRequestCount}
                  </p>
                  <p className="text-[13px] font-bold text-muted">
                    명세와 매칭된 PR
                  </p>
                  <p className="text-xs text-faint">
                    전체 {summary.eligiblePullRequestCount}개 중
                  </p>
                </Card>
                <Card className="space-y-1">
                  <p className="text-[26px] font-extrabold leading-none text-warning">
                    {summary.unmatchedPullRequestCount}
                  </p>
                  <p className="text-[13px] font-bold text-muted">
                    매칭되지 않은 PR
                  </p>
                  {summary.unmatchedPullRequestCount > 0 && (
                    <button
                      type="button"
                      className="text-xs font-bold text-primary underline"
                      onClick={() => setShowUnmatched(true)}
                    >
                      모아 보기 →
                    </button>
                  )}
                </Card>
                <Card className="space-y-1">
                  <p className="text-[26px] font-extrabold leading-none">
                    {summary.evidenceFoundFeatureCount}{' '}
                    <span className="text-sm font-normal text-muted">
                      / {summary.totalFeatureCount}
                    </span>
                  </p>
                  <p className="text-[13px] font-bold text-muted">
                    근거를 찾은 기능
                  </p>
                  <p className="text-xs text-faint">기능 구현률이 아닙니다</p>
                </Card>
                <Card className="space-y-1">
                  <p className="text-[26px] font-extrabold leading-none">
                    {manualFeatureCount ?? '—'}
                  </p>
                  <p className="text-[13px] font-bold text-muted">
                    내가 직접 연결한 기능
                  </p>
                  <p className="text-xs text-faint">AI 연결과 구분해 표시</p>
                </Card>
              </div>
            )}
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <form
                  className="flex min-w-[220px] flex-1 items-end gap-2 sm:max-w-[340px]"
                  onSubmit={(event) => {
                    event.preventDefault()
                    update({ matchQ: search.trim() })
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <Input
                      label="기능 검색"
                      hideLabel
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="기능 검색"
                    />
                  </div>
                  <Button variant="secondary" type="submit">
                    검색
                  </Button>
                </form>
                <div
                  className="flex flex-wrap gap-2"
                  aria-label="기능대조 필터"
                >
                  {filters.map((item) => {
                    const count = summary
                      ? item.value === 'ALL'
                        ? summary.totalFeatureCount
                        : item.value === 'EVIDENCE_FOUND'
                          ? summary.evidenceFoundFeatureCount
                          : summary.attentionRequiredFeatureCount
                      : null
                    return (
                      <FilterChip
                        key={item.value}
                        selected={filter === item.value}
                        onClick={() =>
                          update({
                            matchFilter: item.value === 'ALL' ? '' : item.value,
                          })
                        }
                      >
                        {item.label}
                        {count !== null ? ` ${count}` : ''}
                      </FilterChip>
                    )
                  })}
                </div>
                <div className="ml-auto">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={reloadingResults}
                    onClick={refreshResults}
                  >
                    결과 새로고침
                  </Button>
                </div>
              </div>
              <div
                className="flex flex-wrap items-center gap-2"
                aria-label="저장소 필터"
              >
                <span className="mr-1 text-xs font-bold text-muted">
                  저장소
                </span>
                <FilterChip
                  selected={!repoId}
                  onClick={() => update({ matchRepo: '' })}
                >
                  전체 저장소
                </FilterChip>
                {project.repositories.map((repo) => (
                  <FilterChip
                    key={repo.repositoryId}
                    selected={repoId === repo.repositoryId}
                    onClick={() =>
                      update({ matchRepo: String(repo.repositoryId) })
                    }
                  >
                    {repo.fullName.split('/').at(-1) ?? repo.fullName}
                  </FilterChip>
                ))}
              </div>
              <p className="text-xs leading-relaxed text-muted">
                관련 PR은 구현 완료 판정이 아닙니다. 오른쪽에서 요구사항과 PR
                근거를 확인해주세요.
              </p>
            </div>
            {!results && !error && (
              <p role="status" className="text-[13px] text-muted">
                대조 결과를 불러오는 중입니다…
              </p>
            )}
            {results &&
              (visibleFeatures.length ? (
                <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.65fr)] xl:items-start">
                  <nav
                    aria-label="기능 목록"
                    className="min-w-0 overflow-hidden rounded-[14px] border border-line bg-surface xl:sticky xl:top-4"
                  >
                    <div className="border-b border-line px-4 py-3 text-[13px] font-bold text-muted">
                      기능 목록 {visibleFeatures.length}개
                    </div>
                    <div className="max-h-[55dvh] overflow-y-auto xl:max-h-[calc(100dvh-10rem)]">
                      {results.sections.map((section) => (
                        <div key={section.sectionId ?? 'unsectioned'}>
                          {section.title && (
                            <h3 className="border-b border-line bg-subtle px-4 py-2 text-xs font-bold text-faint">
                              {section.title}
                            </h3>
                          )}
                          {section.features.map((feature) => (
                            <button
                              key={feature.featureId}
                              type="button"
                              data-feature-id={feature.featureId}
                              aria-pressed={
                                selectedFeature?.featureId === feature.featureId
                              }
                              onClick={() => {
                                update({
                                  matchFeature: String(feature.featureId),
                                })
                                if (
                                  window.matchMedia('(max-width: 1279px)')
                                    .matches
                                )
                                  requestAnimationFrame(() =>
                                    evidenceRef.current?.scrollIntoView({
                                      behavior: window.matchMedia(
                                        '(prefers-reduced-motion: reduce)',
                                      ).matches
                                        ? 'auto'
                                        : 'smooth',
                                      block: 'start',
                                    }),
                                  )
                              }}
                              className={`flex w-full items-center gap-3 border-b border-line px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary ${selectedFeature?.featureId === feature.featureId ? 'border-l-[3px] border-l-primary bg-accent-bg' : 'border-l-[3px] border-l-transparent'}`}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block break-words text-[13.5px] font-extrabold text-ink">
                                  {feature.name}
                                </span>
                                <span className="mt-1 block text-xs text-muted">
                                  {typeof feature.requirementCount === 'number'
                                    ? `세부 요구사항 ${feature.requirementCount} · `
                                    : ''}
                                  관련 PR {feature.relatedPullRequestCount}
                                  {feature.reviewStatus === 'UNREVIEWED'
                                    ? ' · 기능 미검토'
                                    : ''}
                                </span>
                              </span>
                              <Badge
                                tone={
                                  feature.evidenceStatus === 'EVIDENCE_FOUND'
                                    ? 'accent'
                                    : 'warning'
                                }
                              >
                                {feature.evidenceStatus === 'EVIDENCE_FOUND'
                                  ? '근거 있음'
                                  : '근거 없음'}
                              </Badge>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </nav>
                  <div
                    ref={evidenceRef}
                    id="feature-evidence"
                    className="min-w-0 scroll-mt-4"
                  >
                    <EvidencePanel
                      key={`${run.featureMatchRunId}-${selectedFeature.featureId}`}
                      featureId={selectedFeature.featureId}
                      runId={run.featureMatchRunId}
                      projectId={project.id}
                      repositories={project.repositories}
                    />
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="조건에 맞는 기능이 없습니다"
                  description="필터나 검색어를 변경해 확인해주세요."
                />
              ))}
            {showUnmatched && (
              <UnmatchedModal
                key={run.featureMatchRunId}
                projectId={project.id}
                runId={run.featureMatchRunId}
                onClose={() => setShowUnmatched(false)}
              />
            )}
          </>
        )}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="기능대조를 시작할까요?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              취소
            </Button>
            <Button onClick={() => void start()}>대조 시작</Button>
          </>
        }
      >
        <div className="space-y-3 text-[13px]">
          <p>현재 명세서의 기능과 연결된 저장소의 PR을 대조합니다.</p>
          {unreviewed !== null && unreviewed > 0 && (
            <Alert tone="warning">
              검토하지 않은 기능 {unreviewed}개도 대조에 포함됩니다.
            </Alert>
          )}
          {run && (
            <Alert tone="warning">
              기존 대조 실행 결과는 새 실행으로 교체됩니다. 사용자 연결은
              서버에서 유지합니다.
            </Alert>
          )}
        </div>
      </Modal>
    </div>
  )
}
