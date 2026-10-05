import { authenticatedFetch } from '../auth/session.ts'
import { readData } from '../../lib/api.ts'
import { ConsentRequired } from '../consent/api.ts'
export interface PullRequestDetail {
  id: number
  number: number
  title: string
  body: string | null
  state: string
  baseRef: string
  createdAtGithub: string | null
  mergedAt: string | null
  htmlUrl: string
  author: { login: string } | null
  repository: { id: number; fullName: string }
  files: { path: string; patchOmitted: boolean }[]
  filesTruncated: boolean
  analysis: {
    status: string
    summary: string | null
    changeType: string | null
    analyzedAt: string | null
    errorCode: string | null
  } | null
  incompleteReasons: string[]
}
const obj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null
const nullableString = (v: unknown) => v === null || typeof v === 'string'
const count = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
function isDetail(v: unknown): v is PullRequestDetail {
  return (
    obj(v) &&
    Number.isSafeInteger(v.id) &&
    Number.isSafeInteger(v.number) &&
    ['title', 'state', 'baseRef', 'htmlUrl'].every(
      (k) => typeof v[k] === 'string',
    ) &&
    ['body', 'createdAtGithub', 'mergedAt'].every((k) =>
      nullableString(v[k]),
    ) &&
    (v.author === null ||
      (obj(v.author) && typeof v.author.login === 'string')) &&
    obj(v.repository) &&
    Number.isSafeInteger(v.repository.id) &&
    typeof v.repository.fullName === 'string' &&
    Array.isArray(v.files) &&
    v.files.every(
      (f) =>
        obj(f) &&
        typeof f.path === 'string' &&
        typeof f.patchOmitted === 'boolean',
    ) &&
    typeof v.filesTruncated === 'boolean' &&
    (v.analysis === null ||
      (obj(v.analysis) &&
        typeof v.analysis.status === 'string' &&
        ['summary', 'changeType', 'analyzedAt', 'errorCode'].every((k) =>
          nullableString((v.analysis as Record<string, unknown>)[k]),
        ))) &&
    Array.isArray(v.incompleteReasons) &&
    v.incompleteReasons.every((r) => typeof r === 'string')
  )
}
export async function getPullRequestDetail(id: number, signal?: AbortSignal) {
  const response = await authenticatedFetch(`/pull-requests/${id}`, { signal })
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? 'PR을 찾을 수 없거나 접근 권한이 없습니다.'
        : 'PR 상세를 불러오지 못했습니다.',
    )
  return readData(response, isDetail, 'PR 상세 응답을 확인할 수 없습니다.')
}
export class PrRetryRejected extends Error {}
export async function retryFailedPrs(projectId: number, repositoryId?: number) {
  const response = await authenticatedFetch(
    `/projects/${projectId}/pull-request-analyses/retry${repositoryId === undefined ? '' : `?repositoryId=${repositoryId}`}`,
    { method: 'POST' },
  )
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    if (response.status === 403 && body?.code === 'CONSENT-001')
      throw new ConsentRequired()
    if (
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 408
    )
      throw new PrRetryRejected()
    throw new Error('Unknown retry outcome')
  }
  return readData(
    response,
    (v): v is { requeuedCount: number } =>
      obj(v) &&
      typeof v.requeuedCount === 'number' &&
      Number.isSafeInteger(v.requeuedCount) &&
      v.requeuedCount >= 0,
    '재시도 접수 결과를 확인하지 못했습니다.',
  )
}
export const failureReasons: Record<string, string> = {
  SUMMARY_LLM_FAILED: 'AI 요약 요청 실패',
  SUMMARY_LLM_TIMEOUT: 'AI 요약 시간 초과',
  SUMMARY_RESPONSE_INVALID: 'AI 응답 형식 오류',
  PATCH_UNAVAILABLE: '변경 내용을 가져오지 못함',
  REPOSITORY_INACCESSIBLE: '저장소 접근 권한 없음',
  CONSENT_REVOKED: 'AI 전송 동의 확인 필요',
  PROJECT_DELETED: '프로젝트 삭제됨',
  REPOSITORY_UNLINKED: '저장소 연결 해제됨',
  GITHUB_DISCONNECTED: 'GitHub 연결 해제됨',
  MAX_ATTEMPTS_EXCEEDED: '재시도 횟수 초과',
}
export const changeTypes: Record<string, string> = {
  FEATURE: '기능 추가',
  BUGFIX: '버그 수정',
  REFACTOR: '리팩터링',
  TEST: '테스트',
  DOCS: '문서',
  INFRA: '빌드·배포·설정',
  STYLE: '포맷팅·린트',
  REVERT: '되돌리기',
  CHORE: '기타 작업',
  OTHER: '기타',
}

export const prStatuses: Record<
  string,
  [string, import('../../components/ui/tones').Tone]
> = {
  COMPLETED: ['분석 성공', 'success'],
  FAILED: ['분석 실패', 'danger'],
  PENDING: ['분석 대기', 'info'],
  RUNNING: ['분석 중', 'accent'],
  CANCELLED: ['분석 취소', 'neutral'],
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
function isPrPage(v: unknown): v is PrPage {
  return (
    obj(v) &&
    count(v.totalElements) &&
    count(v.totalPages) &&
    Array.isArray(v.pullRequests) &&
    v.pullRequests.every(
      (r) =>
        obj(r) &&
        count(r.id) &&
        count(r.number) &&
        typeof r.title === 'string' &&
        typeof r.htmlUrl === 'string' &&
        (r.state === undefined || typeof r.state === 'string') &&
        (r.author == null ||
          (obj(r.author) && typeof r.author.login === 'string')) &&
        obj(r.repository) &&
        count(r.repository.id) &&
        typeof r.repository.fullName === 'string' &&
        (r.analysis === null ||
          (obj(r.analysis) &&
            typeof r.analysis.status === 'string' &&
            (r.analysis.errorCode == null ||
              typeof r.analysis.errorCode === 'string'))),
    )
  )
}
export async function getPrPage(
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
  const response = await authenticatedFetch(
    `/projects/${id}/pull-requests?${params}`,
    { signal },
  )
  if (!response.ok) throw new Error('프로젝트 현황을 불러오지 못했습니다.')
  return readData(
    response,
    isPrPage,
    '프로젝트 현황 응답을 확인할 수 없습니다.',
  )
}
