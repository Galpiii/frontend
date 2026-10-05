import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { Link, useSearchParams } from 'react-router'
import { getMatchOwner } from '../analysis/featureMatch'
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
} from '../components/ui'
import { getFeatureReviewSummary } from '../lib/featureReviewApi'
import {
  connectPullRequest,
  disconnectPullRequest,
  getMatchDetail,
  getMatchResults,
  getUnmatchedPrs,
  MatchApiError,
  MatchOutcomeUnknown,
  type MatchDetail,
  type MatchFilter,
  type MatchResults,
  type UnmatchedPage,
} from '../lib/featureMatchApi'
import type { ProjectDetail } from '../lib/projectApi'
import { getPrPage, type PrPage } from '../lib/projectOverviewApi'
import {
  getPullRequestDetail,
  type PullRequestDetail,
} from '../lib/pullRequestApi'

const Markdown = lazy(() =>
  import('../components/Markdown').then((module) => ({
    default: module.Markdown,
  })),
)

const filters: { value: MatchFilter; label: string }[] = [
  { value: 'ALL', label: '전체 기능' },
  { value: 'EVIDENCE_FOUND', label: '관련 PR 있음' },
  { value: 'ATTENTION_REQUIRED', label: '확인 필요' },
]

function githubUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'github.com'
      ? url.href
      : null
  } catch {
    return null
  }
}

function EmbeddedPrDetail({
  id,
  repositoryIds,
  onBack,
}: {
  id: number
  repositoryIds: number[]
  onBack: () => void
}) {
  const [detail, setDetail] = useState<PullRequestDetail | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const repositoryKey = repositoryIds.join(',')
  useEffect(() => {
    const controller = new AbortController()
    void getPullRequestDetail(id, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        if (!repositoryKey.split(',').includes(String(data.repository.id))) {
          setError('이 프로젝트에 연결된 PR이 아닙니다.')
          return
        }
        setDetail(data)
        setError('')
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('PR 상세를 불러오지 못했습니다.')
      })
    return () => controller.abort()
  }, [id, repositoryKey, reload])
  return (
    <section
      className="min-w-0 overflow-hidden rounded-[14px] border border-line bg-surface"
      aria-label="PR 상세"
    >
      <header className="border-b border-line px-5 py-4 sm:px-6">
        <button
          type="button"
          className="mb-3 text-[13px] font-bold text-primary underline"
          onClick={onBack}
        >
          ← 기능 근거로 돌아가기
        </button>
        <h3 className="break-words text-[17px] font-extrabold">
          {detail ? `#${detail.number} ${detail.title}` : 'PR 상세'}
        </h3>
        {detail && (
          <p className="mt-1 break-all text-xs text-muted">
            {detail.repository.fullName}
          </p>
        )}
      </header>
      <div className="space-y-5 p-5 text-[13px] sm:p-6">
        {error ? (
          <Alert
            tone="warning"
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setError('')
                  setReload((value) => value + 1)
                }}
              >
                다시 조회
              </Button>
            }
          >
            {error}
          </Alert>
        ) : !detail ? (
          <p role="status">PR 상세를 불러오는 중입니다…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">{detail.state}</Badge>
              {detail.analysis?.status === 'COMPLETED' && (
                <Badge tone="accent">AI 분석 완료</Badge>
              )}
            </div>
            <section>
              <h4 className="font-extrabold">PR 설명</h4>
              {detail.body?.trim() ? (
                <Suspense
                  fallback={
                    <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-body">
                      {detail.body}
                    </p>
                  }
                >
                  <Markdown className="mt-2">{detail.body}</Markdown>
                </Suspense>
              ) : (
                <p className="mt-2 text-muted">작성된 설명이 없습니다.</p>
              )}
            </section>
            {detail.analysis?.summary && (
              <section className="border-t border-line pt-4">
                <h4 className="font-extrabold">분석 요약</h4>
                <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-body">
                  {detail.analysis.summary}
                </p>
              </section>
            )}
            <section className="border-t border-line pt-4">
              <h4 className="font-extrabold">
                변경 파일 {detail.files.length}개
              </h4>
              {detail.files.length ? (
                <ul className="mt-2 space-y-1 break-all font-mono text-xs text-body">
                  {detail.files.map((file) => (
                    <li key={file.path}>{file.path}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-muted">파일 정보가 없습니다.</p>
              )}
              {detail.filesTruncated && (
                <p className="mt-2 text-warning">
                  파일 목록의 일부만 표시합니다.
                </p>
              )}
            </section>
            {githubUrl(detail.htmlUrl) && (
              <a
                href={githubUrl(detail.htmlUrl)!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block font-bold text-primary underline"
              >
                GitHub에서 PR 열기 ↗
              </a>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function PrPicker({
  projectId,
  repositories,
  linkedIds,
  busy,
  blocked,
  onClose,
  onConnect,
}: {
  projectId: number
  repositories: ProjectDetail['repositories']
  linkedIds: Set<number>
  busy: boolean
  blocked: boolean
  onClose: () => void
  onConnect: (ids: number[]) => void
}) {
  const [repositoryId, setRepositoryId] = useState<number>()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [response, setResponse] = useState<{
    key: string
    data: PrPage
  } | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [retry, setRetry] = useState(0)
  const requestKey = JSON.stringify([
    projectId,
    repositoryId,
    query,
    page,
    retry,
  ])
  const result = response?.key === requestKey ? response.data : null
  useEffect(() => {
    const controller = new AbortController()
    void getPrPage(
      projectId,
      { repositoryId, q: query || undefined, page, size: 30 },
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setResponse({ key: requestKey, data })
          setError('')
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('PR 목록을 불러오지 못했습니다.')
      })
    return () => controller.abort()
  }, [projectId, repositoryId, query, page, requestKey])
  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return (
    <Modal
      open
      size="wide"
      title="이 기능에 PR 직접 연결"
      description="연결할 PR을 여러 개 선택할 수 있습니다. 이미 연결된 PR은 다시 선택할 수 없습니다."
      onClose={onClose}
      closeDisabled={busy}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] text-muted">선택 {selected.size}개</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              취소
            </Button>
            <Button
              onClick={() => onConnect([...selected])}
              disabled={busy || blocked || selected.size === 0}
              loading={busy}
            >
              추가
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" aria-label="PR 저장소 필터">
          <FilterChip
            selected={!repositoryId}
            onClick={() => {
              setRepositoryId(undefined)
              setPage(0)
            }}
          >
            전체 저장소
          </FilterChip>
          {repositories.map((repo) => (
            <FilterChip
              key={repo.repositoryId}
              selected={repositoryId === repo.repositoryId}
              onClick={() => {
                setRepositoryId(repo.repositoryId)
                setPage(0)
              }}
            >
              {repo.fullName.split('/').at(-1) ?? repo.fullName}
            </FilterChip>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setQuery(search.trim())
            setPage(0)
          }}
        >
          <div className="min-w-0 flex-1">
            <Input
              label="PR 검색"
              hideLabel
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="PR 번호 또는 제목 검색"
            />
          </div>
          <Button type="submit" variant="secondary">
            검색
          </Button>
        </form>
        {error && (
          <Alert
            tone="warning"
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setError('')
                  setRetry((value) => value + 1)
                }}
              >
                다시 조회
              </Button>
            }
          >
            {error}
          </Alert>
        )}
        {!result && !error && (
          <p role="status" className="text-[13px] text-muted">
            PR 목록을 불러오는 중입니다…
          </p>
        )}
        {result && (
          <p className="text-xs text-muted">전체 {result.totalElements}개 PR</p>
        )}
        {result?.pullRequests.length === 0 && (
          <p className="text-[13px] text-muted">조건에 맞는 PR이 없습니다.</p>
        )}
        <div className="max-h-[45dvh] overflow-y-auto rounded-xl border border-line">
          {result?.pullRequests.map((pr) => {
            const linked = linkedIds.has(pr.id)
            return (
              <label
                key={pr.id}
                className={`flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 ${linked ? 'bg-subtle' : 'cursor-pointer hover:bg-subtle'}`}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={linked || selected.has(pr.id)}
                  disabled={
                    linked ||
                    busy ||
                    blocked ||
                    (!selected.has(pr.id) && selected.size >= 100)
                  }
                  onChange={() => toggle(pr.id)}
                  aria-label={`#${pr.number} ${pr.title} 선택`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block break-all text-xs text-muted">
                    {pr.repository.fullName} · #{pr.number}
                  </span>
                  <span className="mt-1 block break-words text-[13px] font-bold">
                    {pr.title}
                  </span>
                </span>
                {linked && <Badge tone="neutral">이미 연결됨</Badge>}
              </label>
            )
          })}
        </div>
        {result && result.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 text-[13px]">
            <Button
              size="sm"
              variant="secondary"
              disabled={page === 0}
              onClick={() => setPage((value) => value - 1)}
            >
              이전
            </Button>
            <span>
              {page + 1} / {result.totalPages}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={page + 1 >= result.totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              다음
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

function EvidencePanel({
  featureId,
  runId,
  projectId,
  repositories,
  onChanged,
}: {
  featureId: number
  runId: number
  projectId: number
  repositories: ProjectDetail['repositories']
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<MatchDetail | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [selectedPrId, setSelectedPrId] = useState<number | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void getMatchDetail(featureId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          if (data.featureMatchRunId !== runId)
            setError('대조 결과가 변경되었습니다. 목록을 다시 확인해주세요.')
          else setDetail(data)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('기능별 근거를 불러오지 못했습니다.')
      })
    return () => controller.abort()
  }, [featureId, runId, reload])
  const change = async (action: () => Promise<unknown>) => {
    if (busy || uncertain) return
    setBusy(true)
    setNotice('')
    try {
      await action()
      setDetail(null)
      setLinkOpen(false)
      setReload((value) => value + 1)
      onChanged()
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
      setReload((value) => value + 1)
      onChanged()
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
                onClick={() => {
                  setError('')
                  setReload((value) => value + 1)
                }}
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
                  disabled={busy || uncertain}
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
                            disabled={busy || uncertain}
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

function UnmatchedModal({
  projectId,
  runId,
  reload = 0,
  onClose,
}: {
  projectId: number
  runId: number
  reload?: number
  onClose: () => void
}) {
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<UnmatchedPage | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    void getUnmatchedPrs(projectId, page, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        if (data.featureMatchRunId !== runId)
          setError('대조 결과가 변경되었습니다. 다시 확인해주세요.')
        else {
          setError('')
          setResult(data)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('연결되지 않은 PR을 불러오지 못했습니다.')
      })
    return () => controller.abort()
  }, [projectId, runId, page, reload])
  return (
    <Modal
      open
      size="wide"
      title="매칭되지 않은 PR"
      description="명세서의 어떤 기능과도 연결되지 않은 PR입니다. PR을 선택하면 상세 내용을 확인할 수 있습니다."
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="warning">{error}</Alert>}
        {!error && !result && (
          <p role="status" className="text-[13px] text-muted">
            PR 목록을 불러오는 중입니다…
          </p>
        )}
        {result && (
          <p className="text-xs text-muted">전체 {result.totalElements}개 PR</p>
        )}
        {result?.pullRequests.length === 0 && (
          <p className="text-[13px] text-muted">
            이 페이지에 연결되지 않은 PR이 없습니다.
          </p>
        )}
        {result && result.pullRequests.length > 0 && (
          <ul className="max-h-[45dvh] overflow-y-auto rounded-xl border border-line">
            {result.pullRequests.map((pr) => (
              <li
                key={pr.pullRequestId}
                className="border-b border-line last:border-b-0"
              >
                <Link
                  to={`/projects/${projectId}?tab=prs&pr=${pr.pullRequestId}`}
                  onClick={onClose}
                  className="block px-4 py-3 hover:bg-subtle"
                >
                  <span className="block break-all text-xs text-muted">
                    {pr.repositoryFullName} · #{pr.number}
                  </span>
                  <span className="mt-1 block break-words text-[13px] font-bold">
                    {pr.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {result && result.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 text-[13px]">
            <Button
              size="sm"
              variant="secondary"
              disabled={page === 0}
              onClick={() => {
                setResult(null)
                setPage((p) => p - 1)
              }}
            >
              이전
            </Button>
            <span>
              {page + 1} / {result.totalPages}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={page + 1 >= result.totalPages}
              onClick={() => {
                setResult(null)
                setPage((p) => p + 1)
              }}
            >
              다음
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

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
  const [search, setSearch] = useState(q)
  const [resultResponse, setResultResponse] = useState<{
    key: string
    view: string
    data: MatchResults
  } | null>(null)
  const [resultError, setResultError] = useState<{
    key: string
    message: string
  } | null>(null)
  const [allResponse, setAllResponse] = useState<{
    key: string
    view: string
    data: MatchResults
  } | null>(null)
  const [actionError, setActionError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [unreviewed, setUnreviewed] = useState<number | null>(null)
  const [starting, setStarting] = useState(false)
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [localRevision, setLocalRevision] = useState(0)
  const evidenceRef = useRef<HTMLDivElement>(null)
  const runId = state.run?.featureMatchRunId
  const runStatus = state.run?.status
  const staleSpec = Boolean(
    state.run &&
    state.run.specDocumentId !== project.specDocument?.specDocumentId,
  )
  // A view is what the user asked to see; a request is one read of it. A
  // reload of the same view (localRevision) keeps the previous results on
  // screen, so the evidence panel and its notices survive a PR (dis)connect.
  const allView = JSON.stringify([
    project.id,
    runId,
    runStatus,
    project.specDocument?.specDocumentId,
  ])
  const view = JSON.stringify([allView, filter, repoId, q])
  const requestKey = JSON.stringify([view, localRevision])
  const allKey = JSON.stringify([allView, localRevision])
  const results = resultResponse?.view === view ? resultResponse.data : null
  const reloadingResults =
    results !== null && resultResponse?.key !== requestKey
  const allResults =
    filter === 'ALL' && !repoId && !q
      ? results
      : allResponse?.view === allView
        ? allResponse.data
        : null
  const error = resultError?.key === requestKey ? resultError.message : ''
  const latestParams = useRef(params)
  useEffect(() => {
    latestParams.current = params
  }, [params])
  useEffect(() => {
    void owner.refresh()
    const timer = window.setInterval(() => void owner.refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [owner])
  useEffect(() => {
    if (
      staleSpec ||
      !runId ||
      !['COMPLETED', 'PARTIALLY_COMPLETED'].includes(runStatus ?? '')
    )
      return
    const controller = new AbortController()
    void getMatchResults(project.id, filter, repoId, q, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        if (data.featureMatchRunId !== runId) {
          setResultError({
            key: requestKey,
            message: '대조 실행이 변경되었습니다. 다시 확인해주세요.',
          })
        } else {
          setResultResponse({ key: requestKey, view, data })
          setResultError(null)
        }
      })
      .catch((caught) => {
        if (controller.signal.aborted) return
        setResultError({
          key: requestKey,
          message:
            caught instanceof MatchApiError &&
            caught.code === 'FEATURE-MATCH-010'
              ? '명세서나 저장소가 변경되어 결과가 오래되었습니다. 최신 상태를 확인해주세요.'
              : '기능대조 결과를 불러오지 못했습니다.',
        })
      })
    return () => controller.abort()
  }, [
    project.id,
    runId,
    runStatus,
    staleSpec,
    localRevision,
    filter,
    repoId,
    q,
    requestKey,
    view,
  ])
  useEffect(() => {
    if (
      staleSpec ||
      !runId ||
      !['COMPLETED', 'PARTIALLY_COMPLETED'].includes(runStatus ?? '') ||
      (filter === 'ALL' && !repoId && !q)
    )
      return
    const controller = new AbortController()
    void getMatchResults(project.id, 'ALL', undefined, '', controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && data.featureMatchRunId === runId)
          setAllResponse({ key: allKey, view: allView, data })
      })
      .catch(() => {})
    return () => controller.abort()
  }, [
    project.id,
    runId,
    runStatus,
    staleSpec,
    localRevision,
    filter,
    repoId,
    q,
    allKey,
    allView,
  ])
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
                      setLocalRevision((value) => value + 1)
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
                    onClick={() => setLocalRevision((value) => value + 1)}
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
                      onChanged={() => setLocalRevision((value) => value + 1)}
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
                reload={localRevision}
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
