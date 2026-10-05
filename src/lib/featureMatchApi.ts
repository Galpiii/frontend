import { authenticatedFetch } from '../auth/session.ts'
import { readData } from './api.ts'

export type MatchStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
export type MatchFilter = 'ALL' | 'EVIDENCE_FOUND' | 'ATTENTION_REQUIRED'

export interface MatchRun {
  featureMatchRunId: number
  status: MatchStatus
  specDocumentId: number
  featureCount: number
  totalTargetCount: number
  pendingCount: number
  runningCount: number
  completedCount: number
  failedCount: number
  cancelledCount: number
  progressPercent: number
  failureCode: string | null
}
export interface MatchCreated {
  featureMatchRunId: number
  status: MatchStatus
  specDocumentId: number
  unreviewedFeatureCount: number
}
export interface MatchFeature {
  featureId: number
  name: string
  reviewStatus: 'UNREVIEWED' | 'USER_CONFIRMED' | 'USER_MODIFIED'
  evidenceStatus: 'EVIDENCE_FOUND' | 'NO_EVIDENCE'
  relatedPullRequestCount: number
  requirementCount?: number
  manualMatchCount?: number
  sourcePageStart: number | null
  sourcePageEnd: number | null
}
export interface MatchResults {
  featureMatchRunId: number
  status: MatchStatus
  summary: {
    totalFeatureCount: number
    evidenceFoundFeatureCount: number
    attentionRequiredFeatureCount: number
    noEvidenceFeatureCount: number
    unreviewedFeatureCount: number
    eligiblePullRequestCount: number
    matchedPullRequestCount: number
    unmatchedPullRequestCount: number
    matchingFailedPullRequestCount: number
    matchingCancelledPullRequestCount: number
    manualMatchCount?: number
  }
  sections: {
    sectionId: number | null
    title: string | null
    features: MatchFeature[]
  }[]
}
export interface MatchDetail {
  featureMatchRunId: number
  featureId: number
  name: string
  reviewStatus: MatchFeature['reviewStatus']
  evidenceStatus: MatchFeature['evidenceStatus']
  relatedPullRequestCount: number
  sourcePageStart?: number | null
  sourcePageEnd?: number | null
  requirements: { requirementId: number; content: string }[]
  repositories: {
    repositoryId: number
    fullName: string
    pullRequests: {
      matchId: number
      source: 'AI' | 'USER'
      reason: string | null
      matchedRequirements: { requirementId: number; content: string }[]
      pullRequest: {
        pullRequestId: number
        number: number
        title: string
        htmlUrl: string
        analysisSummary: string | null
        dataCompleteness: 'COMPLETE' | 'PARTIAL'
      }
    }[]
  }[]
}
export interface UnmatchedPage {
  featureMatchRunId: number
  pullRequests: {
    pullRequestId: number
    repositoryId: number
    repositoryFullName: string
    number: number
    title: string
  }[]
  page: number
  totalPages: number
  totalElements: number
}

const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null
const id = (v: unknown) => Number.isSafeInteger(v) && (v as number) > 0
const count = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0
const str = (v: unknown) => typeof v === 'string'
const status = (v: unknown): v is MatchStatus =>
  [
    'QUEUED',
    'RUNNING',
    'COMPLETED',
    'PARTIALLY_COMPLETED',
    'FAILED',
    'CANCELLED',
  ].includes(String(v))
const review = (v: unknown) =>
  ['UNREVIEWED', 'USER_CONFIRMED', 'USER_MODIFIED'].includes(String(v))
const evidence = (v: unknown) =>
  ['EVIDENCE_FOUND', 'NO_EVIDENCE'].includes(String(v))
const nullable = (v: unknown, guard: (value: unknown) => boolean) =>
  v == null || guard(v)
const requirement = (v: unknown) =>
  object(v) && id(v.requirementId) && str(v.content)
const matchFeature = (v: unknown) =>
  object(v) &&
  id(v.featureId) &&
  str(v.name) &&
  review(v.reviewStatus) &&
  evidence(v.evidenceStatus) &&
  count(v.relatedPullRequestCount) &&
  (v.requirementCount === undefined || count(v.requirementCount)) &&
  (v.manualMatchCount === undefined || count(v.manualMatchCount)) &&
  nullable(v.sourcePageStart, id) &&
  nullable(v.sourcePageEnd, id)
const matchRun = (v: unknown): v is MatchRun =>
  object(v) &&
  id(v.featureMatchRunId) &&
  status(v.status) &&
  id(v.specDocumentId) &&
  [
    'featureCount',
    'totalTargetCount',
    'pendingCount',
    'runningCount',
    'completedCount',
    'failedCount',
    'cancelledCount',
    'progressPercent',
  ].every((k) => count(v[k])) &&
  nullable(v.failureCode, str)
const matchCreated = (v: unknown): v is MatchCreated =>
  object(v) &&
  id(v.featureMatchRunId) &&
  status(v.status) &&
  id(v.specDocumentId) &&
  count(v.unreviewedFeatureCount)
const matchResults = (v: unknown): v is MatchResults =>
  object(v) &&
  id(v.featureMatchRunId) &&
  status(v.status) &&
  object(v.summary) &&
  [
    'totalFeatureCount',
    'evidenceFoundFeatureCount',
    'attentionRequiredFeatureCount',
    'noEvidenceFeatureCount',
    'unreviewedFeatureCount',
    'eligiblePullRequestCount',
    'matchedPullRequestCount',
    'unmatchedPullRequestCount',
    'matchingFailedPullRequestCount',
    'matchingCancelledPullRequestCount',
  ].every((k) => count((v.summary as Record<string, unknown>)[k])) &&
  (v.summary.manualMatchCount === undefined ||
    count(v.summary.manualMatchCount)) &&
  Array.isArray(v.sections) &&
  v.sections.every(
    (s: unknown) =>
      object(s) &&
      nullable(s.sectionId, id) &&
      nullable(s.title, str) &&
      Array.isArray(s.features) &&
      s.features.every(matchFeature),
  )
const matchDetail = (v: unknown): v is MatchDetail =>
  object(v) &&
  id(v.featureMatchRunId) &&
  id(v.featureId) &&
  str(v.name) &&
  review(v.reviewStatus) &&
  evidence(v.evidenceStatus) &&
  count(v.relatedPullRequestCount) &&
  (v.sourcePageStart === undefined || nullable(v.sourcePageStart, id)) &&
  (v.sourcePageEnd === undefined || nullable(v.sourcePageEnd, id)) &&
  Array.isArray(v.requirements) &&
  v.requirements.every(requirement) &&
  Array.isArray(v.repositories) &&
  v.repositories.every(
    (g: unknown) =>
      object(g) &&
      id(g.repositoryId) &&
      str(g.fullName) &&
      Array.isArray(g.pullRequests) &&
      g.pullRequests.every(
        (m: unknown) =>
          object(m) &&
          id(m.matchId) &&
          ['AI', 'USER'].includes(String(m.source)) &&
          nullable(m.reason, str) &&
          Array.isArray(m.matchedRequirements) &&
          m.matchedRequirements.every(requirement) &&
          object(m.pullRequest) &&
          id(m.pullRequest.pullRequestId) &&
          count(m.pullRequest.number) &&
          str(m.pullRequest.title) &&
          str(m.pullRequest.htmlUrl) &&
          nullable(m.pullRequest.analysisSummary, str) &&
          ['COMPLETE', 'PARTIAL'].includes(
            String(m.pullRequest.dataCompleteness),
          ),
      ),
  )
const unmatchedPage = (v: unknown): v is UnmatchedPage =>
  object(v) &&
  id(v.featureMatchRunId) &&
  count(v.page) &&
  count(v.totalPages) &&
  count(v.totalElements) &&
  Array.isArray(v.pullRequests) &&
  v.pullRequests.every(
    (p: unknown) =>
      object(p) &&
      id(p.pullRequestId) &&
      id(p.repositoryId) &&
      str(p.repositoryFullName) &&
      count(p.number) &&
      str(p.title),
  )

export class MatchApiError extends Error {
  status: number
  code: string | null
  constructor(status: number, code: string | null) {
    super('기능대조 요청을 처리하지 못했습니다.')
    this.status = status
    this.code = code
  }
}
export class MatchOutcomeUnknown extends Error {}

async function get<T>(
  path: string,
  guard: (v: unknown) => v is T,
  signal?: AbortSignal,
) {
  const response = await authenticatedFetch(path, { signal, cache: 'no-store' })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new MatchApiError(
      response.status,
      typeof body?.code === 'string' ? body.code : null,
    )
  }
  return readData(response, guard, '기능대조 응답 형식을 확인할 수 없습니다.')
}

export function getLatestMatchRun(projectId: number, signal?: AbortSignal) {
  // The backend reserves FEATURE-MATCH-001 for a project with no run history.
  return get(
    `/projects/${projectId}/feature-match-runs/latest`,
    matchRun,
    signal,
  ).catch((error) => {
    if (
      error instanceof MatchApiError &&
      error.status === 404 &&
      error.code === 'FEATURE-MATCH-001'
    )
      return null
    throw error
  })
}
export const getMatchRun = (runId: number, signal?: AbortSignal) =>
  get(`/feature-match-runs/${runId}`, matchRun, signal)
export function getMatchResults(
  projectId: number,
  filter: MatchFilter,
  repositoryId?: number,
  q?: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  if (filter !== 'ALL') params.set('filter', filter)
  if (repositoryId) params.set('repositoryId', String(repositoryId))
  if (q) params.set('q', q)
  return get(
    `/projects/${projectId}/feature-match-results?${params}`,
    matchResults,
    signal,
  )
}
export const getMatchDetail = (
  featureId: number,
  signal?: AbortSignal,
  repositoryId?: number,
) =>
  get(
    `/features/${featureId}/feature-match-result${repositoryId ? `?repositoryId=${repositoryId}` : ''}`,
    matchDetail,
    signal,
  )

export interface PullRequestFeature {
  featureId: number
  name: string
  sectionTitle: string | null
  source: 'AI' | 'USER'
  reason: string | null
}
export type PullRequestFeatures =
  | { state: 'NO_RUN' | 'IN_PROGRESS' | 'STALE' }
  | { state: 'READY'; features: PullRequestFeature[] }

// The backend has no PR→feature lookup, so the PR is searched for in the
// details of features that have evidence in the PR's repository.
export async function getPullRequestFeatures(
  projectId: number,
  pullRequestId: number,
  repositoryId: number,
  signal?: AbortSignal,
): Promise<PullRequestFeatures> {
  const run = await getLatestMatchRun(projectId, signal)
  if (!run) return { state: 'NO_RUN' }
  if (!['COMPLETED', 'PARTIALLY_COMPLETED'].includes(run.status))
    return { state: 'IN_PROGRESS' }
  let results: MatchResults
  try {
    results = await getMatchResults(
      projectId,
      'EVIDENCE_FOUND',
      repositoryId,
      undefined,
      signal,
    )
  } catch (error) {
    if (error instanceof MatchApiError && error.code === 'FEATURE-MATCH-010')
      return { state: 'STALE' }
    throw error
  }
  const candidates = results.sections.flatMap((section) =>
    section.features
      .filter((feature) => feature.relatedPullRequestCount > 0)
      .map((feature) => ({ feature, sectionTitle: section.title })),
  )
  const features: PullRequestFeature[] = []
  for (let index = 0; index < candidates.length; index += 6) {
    const details = await Promise.all(
      candidates
        .slice(index, index + 6)
        .map(({ feature }) =>
          getMatchDetail(feature.featureId, signal, repositoryId),
        ),
    )
    details.forEach((detail, offset) => {
      const match = detail.repositories
        .flatMap((repository) => repository.pullRequests)
        .find((item) => item.pullRequest.pullRequestId === pullRequestId)
      if (match)
        features.push({
          featureId: detail.featureId,
          name: detail.name,
          sectionTitle: candidates[index + offset].sectionTitle,
          source: match.source,
          reason: match.reason,
        })
    })
  }
  return { state: 'READY', features }
}
export const getUnmatchedPrs = (
  projectId: number,
  page: number,
  signal?: AbortSignal,
) =>
  get(
    `/projects/${projectId}/feature-match-results/unmatched-pull-requests?page=${page}&size=20`,
    unmatchedPage,
    signal,
  )

export async function startMatchRun(projectId: number) {
  let response: Response
  try {
    response = await authenticatedFetch(
      `/projects/${projectId}/feature-match-runs`,
      { method: 'POST' },
    )
  } catch {
    throw new MatchOutcomeUnknown(
      '대조 접수 여부를 확인하지 못했습니다. 다시 전송하지 않고 서버 상태를 조회합니다.',
    )
  }
  if (response.status >= 500 || [408, 409, 425].includes(response.status))
    throw new MatchOutcomeUnknown(
      '대조 접수 여부를 확인하지 못했습니다. 다시 전송하지 않고 서버 상태를 조회합니다.',
    )
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new MatchApiError(
      response.status,
      typeof body?.code === 'string' ? body.code : null,
    )
  }
  try {
    return await readData(
      response,
      matchCreated,
      '기능대조 실행 응답을 확인할 수 없습니다.',
    )
  } catch {
    throw new MatchOutcomeUnknown(
      '접수 응답을 확인하지 못했습니다. 서버 상태를 조회합니다.',
    )
  }
}

async function write(path: string, method: 'POST' | 'DELETE', body?: unknown) {
  let response: Response
  try {
    response = await authenticatedFetch(path, {
      method,
      headers:
        body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new MatchOutcomeUnknown(
      '연결 변경 결과를 확인하지 못했습니다. 다시 요청하지 말고 결과를 확인해주세요.',
    )
  }
  if (response.status >= 500 || [408, 425].includes(response.status))
    throw new MatchOutcomeUnknown(
      '연결 변경 결과를 확인하지 못했습니다. 다시 요청하지 말고 결과를 확인해주세요.',
    )
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new MatchApiError(
      response.status,
      typeof payload?.code === 'string' ? payload.code : null,
    )
  }
  return response
}

export async function connectPullRequest(
  featureId: number,
  pullRequestIds: number[],
) {
  if (
    pullRequestIds.length < 1 ||
    pullRequestIds.length > 100 ||
    pullRequestIds.some((value) => !id(value)) ||
    new Set(pullRequestIds).size !== pullRequestIds.length
  )
    throw new Error('연결할 PR을 1개 이상 100개 이하로 선택해주세요.')
  const response = await write(
    `/features/${featureId}/pull-request-matches`,
    'POST',
    { pullRequestIds },
  )
  try {
    return await readData(
      response,
      (
        value,
      ): value is {
        createdMatches: {
          matchId: number
          featureId: number
          pullRequestId: number
          source: 'USER'
        }[]
      } =>
        object(value) &&
        Array.isArray(value.createdMatches) &&
        value.createdMatches.length === pullRequestIds.length &&
        new Set(
          value.createdMatches.map(
            (match: { pullRequestId: number }) => match.pullRequestId,
          ),
        ).size === pullRequestIds.length &&
        value.createdMatches.every(
          (match: unknown) =>
            object(match) &&
            id(match.matchId) &&
            match.featureId === featureId &&
            pullRequestIds.includes(match.pullRequestId as number) &&
            match.source === 'USER',
        ),
      'PR 연결 응답을 확인할 수 없습니다.',
    )
  } catch {
    throw new MatchOutcomeUnknown(
      '연결 응답을 확인하지 못했습니다. 결과를 다시 확인해주세요.',
    )
  }
}

export async function disconnectPullRequest(matchId: number) {
  await write(`/feature-pr-matches/${matchId}`, 'DELETE')
}
