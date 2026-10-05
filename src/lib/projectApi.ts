import { authenticatedFetch } from '../auth/session.ts'
import { ConsentRequired } from './consentApi.ts'
import { projectPaths, readData } from './api.ts'

export interface LinkedRepository {
  repositoryId: number
  fullName: string
  private?: boolean
  defaultBranch?: string | null
  accessStatus?: string
  lastSyncedAt?: string | null
}
export interface ProjectDetail {
  id: number
  name: string
  status: string
  onboardingStep: string
  repositories: LinkedRepository[]
  lastAnalysis?: {
    analysisRunId: number
    status: string
    requestedAt?: string
  } | null
  specDocument: {
    fileName: string
    specDocumentId?: number
    extractionStatus?: string
  } | null
}

function isLastAnalysis(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value !== 'object') return false
  const run = value as Record<string, unknown>
  return (
    Number.isSafeInteger(run.analysisRunId) &&
    typeof run.status === 'string' &&
    (run.requestedAt == null || typeof run.requestedAt === 'string')
  )
}

function isProjectDetail(value: unknown): value is ProjectDetail {
  if (typeof value !== 'object' || value === null) return false
  const project = value as Record<string, unknown>
  return (
    typeof project.id === 'number' &&
    typeof project.name === 'string' &&
    typeof project.status === 'string' &&
    typeof project.onboardingStep === 'string' &&
    isLastAnalysis(project.lastAnalysis) &&
    Array.isArray(project.repositories) &&
    project.repositories.every((repo: unknown) => {
      if (typeof repo !== 'object' || repo === null) return false
      const repository = repo as Record<string, unknown>
      return (
        typeof repository.repositoryId === 'number' &&
        typeof repository.fullName === 'string' &&
        (repository.private === undefined ||
          typeof repository.private === 'boolean') &&
        ['defaultBranch', 'lastSyncedAt', 'accessStatus'].every(
          (key) =>
            repository[key] == null || typeof repository[key] === 'string',
        )
      )
    }) &&
    (project.specDocument === null ||
      (typeof project.specDocument === 'object' &&
        project.specDocument !== null &&
        typeof (project.specDocument as Record<string, unknown>).fileName ===
          'string' &&
        ((project.specDocument as Record<string, unknown>).extractionStatus ===
          undefined ||
          typeof (project.specDocument as Record<string, unknown>)
            .extractionStatus === 'string') &&
        ((project.specDocument as Record<string, unknown>).specDocumentId ===
          undefined ||
          Number.isSafeInteger(
            (project.specDocument as Record<string, unknown>).specDocumentId,
          ))))
  )
}

/** The project is gone or not this user's; polling it again cannot help. */
export class ProjectNotFound extends Error {
  constructor() {
    super(
      '프로젝트를 찾을 수 없습니다. 삭제되었거나 접근 권한이 없을 수 있습니다.',
    )
  }
}

export async function getProjectDetail(
  projectId: number,
  signal?: AbortSignal,
) {
  const response = await authenticatedFetch(projectPaths.project(projectId), {
    signal,
  })
  if (response.status === 404) throw new ProjectNotFound()
  if (!response.ok) throw new Error('프로젝트 정보를 불러오지 못했습니다.')
  return readData(
    response,
    isProjectDetail,
    '프로젝트 응답을 확인할 수 없습니다.',
  )
}

export async function skipProjectSpec(projectId: number, signal?: AbortSignal) {
  const response = await authenticatedFetch(projectPaths.project(projectId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ onboardingStep: 'REPOSITORIES' }),
    signal,
  })
  if (!response.ok)
    throw new Error('진행 단계를 저장하지 못했습니다. 다시 시도해주세요.')
}

interface AnalysisRun {
  inaccessibleRepositoryCount: number
}

function isAnalysisRun(value: unknown): value is AnalysisRun {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).inaccessibleRepositoryCount ===
      'number'
  )
}

/**
 * Most 4xx responses confirm rejection. 408/425 are ambiguous; 409 may
 * indicate an existing run, so these must be reconciled through status reads.
 * A 5xx or any other failure — a dropped connection, a timeout, an unreadable body
 * after a 2xx — leaves the run's fate unknown, and the user must not be told to
 * request it again.
 */
export class AnalysisRequestRejected extends Error {
  constructor() {
    super('분석을 요청하지 못했습니다.')
  }
}

/** Shared by the first analysis and the project menu's retry action. */
export async function startProjectAnalysis(
  projectId: number,
  signal?: AbortSignal,
  repositoryIds?: number[],
) {
  if (
    repositoryIds &&
    (repositoryIds.length === 0 ||
      repositoryIds.some((id) => !Number.isSafeInteger(id) || id <= 0))
  )
    throw new AnalysisRequestRejected()
  // A separate endpoint fails closed against older servers; never fall back to all.
  const response = await authenticatedFetch(
    projectPaths.analyses(projectId) + (repositoryIds ? '/selected' : ''),
    {
      method: 'POST',
      ...(repositoryIds
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repositoryIds }),
          }
        : {}),
      signal,
    },
  )
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    if (response.status === 403 && body?.code === 'CONSENT-001')
      throw new ConsentRequired()
    if (
      response.status >= 400 &&
      response.status < 500 &&
      ![408, 409, 425].includes(response.status)
    )
      throw new AnalysisRequestRejected()
    throw new Error('Analysis outcome unknown')
  }
  return readData(response, isAnalysisRun, '분석 응답을 확인할 수 없습니다.')
}

export function analysisStartedMessage(inaccessibleRepositoryCount: number) {
  return inaccessibleRepositoryCount > 0
    ? `분석을 시작했습니다. 접근 권한이 없는 저장소 ${inaccessibleRepositoryCount}개는 이번 분석에서 제외됩니다.`
    : '분석을 시작했습니다.'
}
