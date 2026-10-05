import { authenticatedFetch } from '../auth/session'
import { API_PATHS, projectPaths, readData } from '../../lib/api'
import type { RepositoryRow, SelectableRepository } from './repositoryFilters'

/**
 * Only the fields this screen renders are required. A backend addition must not
 * reject the whole list, and an omitted description is not a broken response.
 */
function isRepository(value: unknown): value is SelectableRepository {
  if (typeof value !== 'object' || value === null) return false
  const repo = value as Record<string, unknown>
  return (
    typeof repo.githubRepositoryId === 'number' &&
    typeof repo.owner === 'string' &&
    typeof repo.name === 'string' &&
    typeof repo.fullName === 'string' &&
    typeof repo.private === 'boolean' &&
    typeof repo.linked === 'boolean'
  )
}

interface FailedInstallation {
  accountLogin: string
  reason: string
}

interface SelectableRepositories {
  installations: {
    installation?: { accountLogin?: string; accountType?: string }
    repositories: SelectableRepository[]
    truncated?: boolean
  }[]
  failedInstallations?: FailedInstallation[]
  truncated?: boolean
}

function isFailedInstallation(value: unknown): value is FailedInstallation {
  if (typeof value !== 'object' || value === null) return false
  const failure = value as Record<string, unknown>
  return (
    typeof failure.accountLogin === 'string' &&
    typeof failure.reason === 'string'
  )
}

function isSelectableRepositories(
  value: unknown,
): value is SelectableRepositories {
  if (typeof value !== 'object' || value === null) return false
  const { installations, failedInstallations } = value as Record<
    string,
    unknown
  >
  return (
    Array.isArray(installations) &&
    installations.every((group) => {
      if (typeof group !== 'object' || group === null) return false
      const { repositories } = group as Record<string, unknown>
      return Array.isArray(repositories) && repositories.every(isRepository)
    }) &&
    (failedInstallations === undefined ||
      (Array.isArray(failedInstallations) &&
        failedInstallations.every(isFailedInstallation)))
  )
}

function isConnectedList(
  value: unknown,
): value is { githubRepositoryId: number; repositoryId: number }[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).githubRepositoryId ===
          'number' &&
        Number.isSafeInteger((item as Record<string, unknown>).repositoryId) &&
        Number((item as Record<string, unknown>).repositoryId) > 0,
    )
  )
}

function isInstallUrl(value: unknown): value is { installUrl: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).installUrl === 'string'
  )
}

/** GitHub reports these differently, and each one needs a different fix. */
function resolveMessage(status: number) {
  if (status === 400)
    return 'URL 형식을 확인해주세요. 예: https://github.com/owner/repository'
  if (status === 403)
    return '조직이 앱 접근을 승인하지 않았습니다. GitHub 조직 권한을 확인해주세요.'
  if (status === 409) return '이미 이 프로젝트에 연결된 저장소입니다.'
  if (status === 404)
    return '저장소를 찾을 수 없거나 접근 권한이 없습니다. 주소를 확인해주세요.'
  return '저장소를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.'
}

/** Flattens installations; account type lives on the installation. */
export async function listGithubRepositories(
  projectId: number,
  signal: AbortSignal,
) {
  const search = new URLSearchParams({ projectId: String(projectId) })
  const response = await authenticatedFetch(
    `${API_PATHS.githubRepositories}?${search}`,
    { signal },
  )
  if (!response.ok) throw new Error('Repository request failed')
  const data = await readData(
    response,
    isSelectableRepositories,
    'Invalid repository list',
  )
  return {
    rows: data.installations.flatMap((group) =>
      group.repositories.map((repo): RepositoryRow => ({
        ...repo,
        accountLogin: group.installation?.accountLogin ?? repo.owner,
        // GitHub's own value is "Organization"; anything else, including a
        // missing field, is treated as a personal account.
        organization: group.installation?.accountType === 'Organization',
      })),
    ),
    failures: data.failedInstallations ?? [],
    // GitHub caps what one request can return and there is no way to page for
    // the rest, so a partial list has to say so; filtering would hide the gap.
    truncated:
      data.truncated === true ||
      data.installations.some((it) => it.truncated === true),
  }
}

/** Checks a pasted URL: format, existence, access and duplicates. */
export async function resolveRepository(projectId: number, url: string) {
  const response = await authenticatedFetch(
    projectPaths.resolveRepository(projectId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    },
  )
  if (!response.ok) throw new Error(resolveMessage(response.status))
  return readData(response, isRepository, '저장소 응답을 확인할 수 없습니다.')
}

/** Links the selection; every requested repository must come back linked. */
export async function connectRepositories(
  projectId: number,
  githubRepositoryIds: number[],
) {
  const response = await authenticatedFetch(
    projectPaths.repositories(projectId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ githubRepositoryIds }),
    },
  )
  if (!response.ok)
    throw new Error('저장소를 연결하지 못했습니다. 잠시 후 다시 시도해주세요.')
  const connected = await readData(
    response,
    isConnectedList,
    '연결 응답을 확인할 수 없습니다.',
  )
  if (
    !githubRepositoryIds.every((value) =>
      connected.some((repo) => repo.githubRepositoryId === value),
    )
  )
    throw new Error('연결 결과를 확인할 수 없습니다. 다시 시도해주세요.')
  return connected
}

/** A GitHub App install address that returns to `returnTo` afterwards. */
export async function getInstallUrl(returnTo: string) {
  const search = new URLSearchParams({ returnTo })
  const response = await authenticatedFetch(
    `${API_PATHS.githubInstallUrl}?${search}`,
    { method: 'POST' },
  )
  if (!response.ok) throw new Error('설치 주소를 발급하지 못했습니다.')
  const data = await readData(
    response,
    isInstallUrl,
    '설치 주소를 확인할 수 없습니다.',
  )
  return data.installUrl
}

export async function unlinkRepository(
  projectId: number,
  repositoryId: number,
) {
  const response = await authenticatedFetch(
    `${projectPaths.repositories(projectId)}/${repositoryId}`,
    { method: 'DELETE' },
  )
  if (!response.ok) throw new Error('저장소 연결을 해제하지 못했습니다.')
}
