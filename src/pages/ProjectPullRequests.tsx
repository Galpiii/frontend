import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Select,
  SectionHeader,
} from '../components/ui'
import { PrStatusBadge } from '../components/PrStatusBadge'
import { prStatuses } from '../lib/pullRequestApi'
import type { ProjectDetail } from '../lib/projectApi'
import {
  displayDate,
  getPrPage,
  type PrPage,
  type loadOverview,
} from '../lib/projectOverviewApi'
import { AnalysisManagementDrawer } from './AnalysisManagementDrawer'
import { PullRequestDetailDrawer } from './PullRequestDetailDrawer'

export function ProjectPullRequests({
  project,
  data,
  refresh,
}: {
  project: ProjectDetail
  data: Awaited<ReturnType<typeof loadOverview>> | null
  refresh: () => void
}) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const latestParams = useRef(params)
  useEffect(() => {
    latestParams.current = params
  }, [params])
  const repository = params.get('repository') ?? ''
  const status = params.get('status') ?? ''
  const author = params.get('author') ?? ''
  const query = params.get('q') ?? ''
  const sort = params.get('sort') ?? 'MERGED_AT_DESC'
  const page = Math.max(0, Number(params.get('page')) || 0)
  const selectedPr = Number(params.get('pr'))
  const manage = params.get('panel') === 'analysis'
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<PrPage | null>(null)
  const [error, setError] = useState('')
  function update(patch: Record<string, string>, resetPage = true) {
    const next = new URLSearchParams(latestParams.current)
    if (resetPage) next.delete('page')
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    latestParams.current = next
    setParams(next)
  }
  const reload = () => {
    setAttempt((v) => v + 1)
    refresh()
  }
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setResult(null)
      setError('')
      try {
        const list = await getPrPage(
          project.id,
          {
            repositoryId: repository ? Number(repository) : undefined,
            analysisStatus: status || undefined,
            authorLogin: author || undefined,
            q: query || undefined,
            sort,
            page,
            size: 20,
          },
          controller.signal,
        )
        if (!controller.signal.aborted) setResult(list)
      } catch {
        if (!controller.signal.aborted)
          setError('PR 목록을 불러오지 못했습니다.')
      }
    }
    void load()
    return () => controller.abort()
  }, [project.id, repository, status, author, query, sort, page, attempt])
  const groups = new Map<number, NonNullable<typeof result>['pullRequests']>()
  result?.pullRequests.forEach((pr) =>
    groups.set(pr.repository.id, [...(groups.get(pr.repository.id) ?? []), pr]),
  )
  const failures = data?.overview?.failedCount
  const failedRepos =
    data?.overview?.repositories.filter((r) => r.failedCount > 0).length ?? 0
  return (
    <section className="space-y-4">
      {!project.specDocument && (
        <Alert
          tone="warning"
          action={
            <Button
              variant="secondary"
              onClick={() => navigate(`/projects/${project.id}?tab=match`)}
            >
              기능명세서 등록 →
            </Button>
          }
        >
          기능명세서가 없습니다. PDF를 등록해 기능 항목을 추출할 수 있습니다.
        </Alert>
      )}
      <SectionHeader
        level={1}
        title="PR 목록"
        description={`PR ${data?.overview?.totalCount ?? '—'}개 · 실패 ${failures ?? '—'}개 · 마지막 분석 ${displayDate(data?.overview?.lastAnalyzedAt)}`}
        action={
          <Button
            variant="secondary"
            onClick={() => update({ panel: 'analysis', pr: '' }, false)}
          >
            분석 관리 {!!failures && <Badge tone="danger">{failures}</Badge>}
          </Button>
        }
      />
      {!!failedRepos && (
        <Alert
          tone="warning"
          action={
            <button
              className="font-bold underline"
              onClick={() => update({ panel: 'analysis', pr: '' }, false)}
            >
              분석 관리 열기
            </button>
          }
        >
          분석하지 못한 PR이 있는 저장소 {failedRepos}개
        </Alert>
      )}
      <Card className="p-4">
        <form
          className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            update({
              q: String(new FormData(e.currentTarget).get('q') ?? '').trim(),
              author: String(
                new FormData(e.currentTarget).get('author') ?? '',
              ).trim(),
            })
          }}
        >
          <Select
            label="저장소"
            value={repository}
            onChange={(e) => update({ repository: e.target.value })}
          >
            <option value="">전체 저장소</option>
            {project.repositories.map((r) => (
              <option key={r.repositoryId} value={r.repositoryId}>
                {r.fullName}
              </option>
            ))}
          </Select>
          <Input
            label="작성자"
            placeholder="GitHub 로그인명"
            name="author"
            key={`author-${author}`}
            defaultValue={author}
          />
          <Input
            label="PR 검색"
            placeholder="PR 번호 또는 제목"
            name="q"
            key={`query-${query}`}
            defaultValue={query}
          />
          <Select
            label="정렬"
            value={sort}
            onChange={(e) => update({ sort: e.target.value })}
          >
            <option value="MERGED_AT_DESC">최신순</option>
            <option value="MERGED_AT_ASC">오래된순</option>
            <option value="NUMBER_DESC">번호 내림차순</option>
            <option value="NUMBER_ASC">번호 오름차순</option>
          </Select>
          <Button type="submit">검색</Button>
        </form>
      </Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Select
          label="분석 상태"
          value={status}
          onChange={(e) => update({ status: e.target.value })}
        >
          <option value="">전체 상태</option>
          {Object.entries(prStatuses).map(([value, [label]]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted">
          기준 · Merge됨 PR · 각 저장소 기본 브랜치 · 전체 기간
        </p>
        <Button size="sm" variant="secondary" onClick={reload}>
          새로고침
        </Button>
      </div>
      {error ? (
        <Alert
          tone="warning"
          action={
            <Button size="sm" variant="secondary" onClick={reload}>
              다시 조회
            </Button>
          }
        >
          {error}
        </Alert>
      ) : !result ? (
        <p role="status" className="py-8 text-center text-muted">
          PR 목록을 불러오는 중입니다…
        </p>
      ) : (
        <>
          {result.pullRequests.length === 0 ? (
            <Card>조건에 맞는 PR이 없습니다.</Card>
          ) : (
            <>
              <p className="text-xs text-faint">
                검색 결과 {result.totalElements}개 · 현재 페이지의 PR을
                저장소별로 표시합니다.
              </p>
              {[...groups].map(([id, prs]) => (
                <details
                  key={id}
                  open
                  className="overflow-hidden rounded-xl border border-line bg-surface"
                >
                  <summary className="flex flex-wrap items-center gap-3 bg-subtle px-4 py-4">
                    <span aria-hidden="true">▾</span>
                    <span className="break-all font-mono font-extrabold">
                      {prs[0].repository.fullName.split('/').at(-1)}
                    </span>
                    <span className="min-w-0 flex-1 break-all font-mono text-xs text-faint">
                      {prs[0].repository.fullName}
                    </span>
                    <Badge tone="accent">이 페이지 {prs.length}개</Badge>
                  </summary>
                  <ul>
                    {prs.map((pr) => (
                      <li
                        key={pr.id}
                        className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3"
                      >
                        <span className="w-10 text-xs text-faint">
                          #{pr.number}
                        </span>
                        <button
                          className="min-w-0 flex-1 break-words text-left text-[13px] font-bold hover:text-primary"
                          onClick={() =>
                            update({ pr: String(pr.id), panel: '' }, false)
                          }
                        >
                          {pr.title}
                        </button>
                        <span className="text-xs text-muted">
                          {pr.author?.login ?? '작성자 정보 없음'}
                        </span>
                        <Badge tone="info">{pr.state ?? 'MERGED'}</Badge>
                        <PrStatusBadge status={pr.analysis?.status} />
                        <button
                          className="text-xs font-bold text-primary"
                          aria-label={`PR #${pr.number} 상세`}
                          onClick={() =>
                            update({ pr: String(pr.id), panel: '' }, false)
                          }
                        >
                          상세 ›
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </>
          )}
          {result.totalPages > 1 && (
            <nav
              aria-label="PR 페이지"
              className="flex items-center justify-center gap-4"
            >
              <Button
                variant="secondary"
                disabled={page === 0}
                onClick={() => update({ page: String(page - 1) }, false)}
              >
                이전
              </Button>
              <span>
                {page + 1} / {result.totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page + 1 >= result.totalPages}
                onClick={() => update({ page: String(page + 1) }, false)}
              >
                다음
              </Button>
            </nav>
          )}
        </>
      )}
      {manage && (
        <AnalysisManagementDrawer
          project={project}
          data={data}
          refresh={reload}
          onClose={() => update({ panel: '' }, false)}
          onRepository={(id) =>
            update({ repository: String(id), panel: '', status: '' })
          }
        />
      )}
      {Number.isSafeInteger(selectedPr) && selectedPr > 0 && (
        <PullRequestDetailDrawer
          key={selectedPr}
          id={selectedPr}
          projectId={project.id}
          repositoryIds={project.repositories.map((r) => r.repositoryId)}
          onClose={() => update({ pr: '' }, false)}
        />
      )}
    </section>
  )
}
