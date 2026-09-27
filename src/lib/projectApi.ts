import { authenticatedFetch } from '../auth/session.ts'
import { projectPaths, readData } from './api.ts'

export interface ProjectDetail {
  id: number
  name: string
  status: string
  onboardingStep: string
  repositories: { repositoryId: number; fullName: string }[]
  specDocument: { fileName: string } | null
}

function isProjectDetail(value: unknown): value is ProjectDetail {
  if (typeof value !== 'object' || value === null) return false
  const project = value as Record<string, unknown>
  return (
    typeof project.id === 'number' &&
    typeof project.name === 'string' &&
    typeof project.status === 'string' &&
    typeof project.onboardingStep === 'string' &&
    Array.isArray(project.repositories) &&
    project.repositories.every((repo: unknown) => {
      if (typeof repo !== 'object' || repo === null) return false
      const repository = repo as Record<string, unknown>
      return (
        typeof repository.repositoryId === 'number' &&
        typeof repository.fullName === 'string'
      )
    }) &&
    (project.specDocument === null ||
      (typeof project.specDocument === 'object' &&
        project.specDocument !== null &&
        typeof (project.specDocument as Record<string, unknown>).fileName ===
          'string'))
  )
}

export async function getProjectDetail(
  projectId: number,
  signal?: AbortSignal,
) {
  const response = await authenticatedFetch(projectPaths.project(projectId), {
    signal,
  })
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? '프로젝트를 찾을 수 없습니다. 삭제되었거나 접근 권한이 없을 수 있습니다.'
        : '프로젝트 정보를 불러오지 못했습니다.',
    )
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
 * The server answered and refused, so nothing was queued and a retry is safe.
 * Every other failure — a dropped connection, a timeout, an unreadable body
 * after a 2xx — leaves the run's fate unknown, and the user must not be told to
 * request it again.
 */
export class AnalysisRequestRejected extends Error {
  constructor() {
    super('분석을 요청하지 못했습니다.')
  }
}

/** Shared by the first analysis and the project menu's retry action. */
export async function startProjectAnalysis(projectId: number) {
  const response = await authenticatedFetch(projectPaths.analyses(projectId), {
    method: 'POST',
  })
  if (!response.ok) throw new AnalysisRequestRejected()
  return readData(response, isAnalysisRun, '분석 응답을 확인할 수 없습니다.')
}

export function analysisStartedMessage(inaccessibleRepositoryCount: number) {
  return inaccessibleRepositoryCount > 0
    ? `분석을 시작했습니다. 접근 권한이 없는 저장소 ${inaccessibleRepositoryCount}개는 이번 분석에서 제외됩니다.`
    : '분석을 시작했습니다.'
}
