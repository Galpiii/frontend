import {
  getPrPage,
  getPullRequestDetail,
  type PullRequestDetail,
} from './api.ts'

export function getExcludedFilePaths(detail: PullRequestDetail): string[] {
  return [
    ...new Set(
      detail.files.filter((file) => file.patchOmitted).map((file) => file.path),
    ),
  ]
}

/** These limits do not provide a complete per-file exclusion list in the API. */
export function hasUnlistedFiles(reasons: readonly string[] = []): boolean {
  return reasons.some((reason) =>
    [
      'FILE_LIMIT_EXCEEDED',
      'PR_LIMIT_EXCEEDED',
      'TOTAL_CONTENT_LIMIT',
      'ARCHIVE_SIZE_LIMIT',
      'RATE_LIMITED',
      'PR_COLLECTION_PARTIAL',
      'PR_CONTENT_LIMIT',
      'PR_REQUEST_LIMIT',
      'FILE_READ_FAILED',
    ].includes(reason),
  )
}

export interface ExcludedFileGroup {
  id: number
  number: number
  htmlUrl: string
  paths: string[]
}

export async function loadRepositoryExcludedFiles(
  projectId: number,
  repositoryId: number,
  signal: AbortSignal,
  api = { getPrPage, getPullRequestDetail },
) {
  const groups: ExcludedFileGroup[] = []
  const seen = new Set<number>()
  let unavailablePrCount = 0
  let incomplete = false
  let totalPages = 1

  for (let page = 0; page < totalPages; page++) {
    signal.throwIfAborted()
    const result = await api.getPrPage(
      projectId,
      { repositoryId, page, size: 100 },
      signal,
    )
    signal.throwIfAborted()
    if (result.pullRequests.some((pr) => pr.repository.id !== repositoryId)) {
      throw new Error('이 저장소의 파일 목록을 확인할 수 없습니다.')
    }
    totalPages = result.totalPages
    const requests = result.pullRequests.filter((pr) => {
      if (seen.has(pr.id)) return false
      seen.add(pr.id)
      return true
    })

    // Only expanded notices load details, with at most four concurrent reads.
    for (let i = 0; i < requests.length; i += 4) {
      signal.throwIfAborted()
      const details = await Promise.allSettled(
        requests.slice(i, i + 4).map(async (pr) => {
          const detail = await api.getPullRequestDetail(pr.id, signal)
          if (detail.id !== pr.id || detail.repository.id !== repositoryId) {
            throw new Error('이 저장소의 PR이 아닙니다.')
          }
          return detail
        }),
      )
      signal.throwIfAborted()
      for (const detail of details) {
        if (detail.status === 'rejected') {
          unavailablePrCount++
          continue
        }
        const value = detail.value
        incomplete ||=
          value.filesTruncated || hasUnlistedFiles(value.incompleteReasons)
        const paths = getExcludedFilePaths(value)
        if (paths.length) {
          groups.push({
            id: value.id,
            number: value.number,
            htmlUrl: value.htmlUrl,
            paths,
          })
        }
      }
    }
  }

  return { groups, unavailablePrCount, incomplete }
}
