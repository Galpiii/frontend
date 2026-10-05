import { authenticatedFetch } from '../auth/session.ts'
import { readData } from '../../lib/api.ts'
import { getPrPage } from '../pull-requests/api.ts'

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
