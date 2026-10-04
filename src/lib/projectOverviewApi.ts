import { authenticatedFetch } from '../auth/session.ts'
import { readData } from './api.ts'

export interface PrOverview {
  totalCount: number
  failedCount: number
  pendingCount: number
  excludedCount?: number
  lastAnalyzedAt?: string | null
  criteria?: { state: string; baseBranch: string; period: string }
  repositories: {
    id: number
    fullName: string
    pullRequestCount: number
    failedCount: number
  }[]
}
export interface PrPage {
  totalElements: number
  totalPages: number
  pullRequests: {
    id: number
    number: number
    title: string
    htmlUrl: string
    state?: string
    mergedAt?: string | null
    author?: { login: string } | null
    repository: { id: number; fullName: string }
    analysis: { status: string; errorCode?: string | null } | null
  }[]
}
export interface RunDetail {
  analysisRunId: number
  status: string
  repositories: {
    repositoryId: number
    status: string
    incompleteReasons: string[]
  }[]
}
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null
const count = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
function isOverview(v: unknown): v is PrOverview {
  return (
    object(v) &&
    count(v.totalCount) &&
    count(v.failedCount) &&
    count(v.pendingCount) &&
    (v.lastAnalyzedAt == null || typeof v.lastAnalyzedAt === 'string') &&
    Array.isArray(v.repositories) &&
    v.repositories.every(
      (r) =>
        object(r) &&
        count(r.id) &&
        typeof r.fullName === 'string' &&
        count(r.pullRequestCount) &&
        count(r.failedCount),
    )
  )
}
function isPrPage(v: unknown): v is PrPage {
  return (
    object(v) &&
    count(v.totalElements) &&
    count(v.totalPages) &&
    Array.isArray(v.pullRequests) &&
    v.pullRequests.every(
      (r) =>
        object(r) &&
        count(r.id) &&
        count(r.number) &&
        typeof r.title === 'string' &&
        typeof r.htmlUrl === 'string' &&
        (r.state === undefined || typeof r.state === 'string') &&
        (r.author == null ||
          (object(r.author) && typeof r.author.login === 'string')) &&
        object(r.repository) &&
        count(r.repository.id) &&
        typeof r.repository.fullName === 'string' &&
        (r.analysis === null ||
          (object(r.analysis) &&
            typeof r.analysis.status === 'string' &&
            (r.analysis.errorCode == null ||
              typeof r.analysis.errorCode === 'string'))),
    )
  )
}
function isRun(v: unknown): v is RunDetail {
  return (
    object(v) &&
    count(v.analysisRunId) &&
    typeof v.status === 'string' &&
    Array.isArray(v.repositories) &&
    v.repositories.every(
      (r) =>
        object(r) &&
        count(r.repositoryId) &&
        typeof r.status === 'string' &&
        Array.isArray(r.incompleteReasons) &&
        r.incompleteReasons.every((x) => typeof x === 'string'),
    )
  )
}
async function get<T>(
  path: string,
  guard: (v: unknown) => v is T,
  signal?: AbortSignal,
) {
  const response = await authenticatedFetch(path, { signal })
  if (!response.ok) throw new Error('프로젝트 현황을 불러오지 못했습니다.')
  return readData(response, guard, '프로젝트 현황 응답을 확인할 수 없습니다.')
}
export const getPrOverview = (id: number, signal?: AbortSignal) =>
  get(`/projects/${id}/pull-requests/summary`, isOverview, signal)
export const getRunDetail = (id: number, signal?: AbortSignal) =>
  get(`/analyses/${id}`, isRun, signal)
export interface RepositoryAnalysisStatus {
  repositoryId: number
  analysisRunId: number
  status: string
  incompleteReasons: string[]
}
function isRepositoryStatuses(v: unknown): v is RepositoryAnalysisStatus[] {
  return (
    Array.isArray(v) &&
    v.every(
      (r) =>
        object(r) &&
        count(r.repositoryId) &&
        count(r.analysisRunId) &&
        typeof r.status === 'string' &&
        Array.isArray(r.incompleteReasons) &&
        r.incompleteReasons.every((x) => typeof x === 'string'),
    )
  )
}
export const getRepositoryAnalysisStatuses = (
  id: number,
  signal?: AbortSignal,
) => get(`/projects/${id}/analyses/repositories`, isRepositoryStatuses, signal)

export function getPrPage(
  id: number,
  options: {
    repositoryId?: number
    analysisStatus?: string
    authorLogin?: string
    q?: string
    sort?: string
    page?: number
    size?: number
  } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(options))
    if (value !== undefined) params.set(key, String(value))
  return get(`/projects/${id}/pull-requests?${params}`, isPrPage, signal)
}
export async function getCompletedCount(
  id: number,
  repositoryId?: number,
  signal?: AbortSignal,
) {
  return (
    await getPrPage(
      id,
      { repositoryId, analysisStatus: 'COMPLETED', size: 1 },
      signal,
    )
  ).totalElements
}

/** Missing/failed counts stay unknown; total - failed is NOT a completed count. */
export async function loadOverview(
  id: number,
  repositoryIds: number[],
  runId: number | undefined,
  signal: AbortSignal,
) {
  const [overview, completed, run] = await Promise.allSettled([
    getPrOverview(id, signal),
    getCompletedCount(id, undefined, signal),
    runId === undefined
      ? Promise.resolve([])
      : getRepositoryAnalysisStatuses(id, signal),
  ])
  const repositoryCompleted: Record<number, number | undefined> = {}
  let partial = [overview, completed, run].some((r) => r.status === 'rejected')
  // Bound fan-out: the existing summary has no per-repository completed count.
  for (let i = 0; i < repositoryIds.length; i += 4) {
    signal.throwIfAborted()
    const ids = repositoryIds.slice(i, i + 4)
    const results = await Promise.allSettled(
      ids.map((repo) => getCompletedCount(id, repo, signal)),
    )
    results.forEach((result, index) => {
      if (result.status === 'fulfilled')
        repositoryCompleted[ids[index]] = result.value
      else partial = true
    })
  }
  return {
    overview: overview.status === 'fulfilled' ? overview.value : null,
    completed: completed.status === 'fulfilled' ? completed.value : null,
    repositoryStatuses: run.status === 'fulfilled' ? run.value : null,
    repositoryCompleted,
    partial,
  }
}

export function githubUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'github.com'
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}
export function displayDate(value?: string | null) {
  if (!value) return '기록 없음'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '기록 없음'
    : date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}
