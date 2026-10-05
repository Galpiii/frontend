import { useQuery } from '@tanstack/react-query'
import { getPullRequestDetail } from './api'
import { pullRequestKeys } from './keys'

/**
 * One PR's detail, shared by the PR drawer and the feature-match evidence
 * view. A PR outside the project's repositories is never shown.
 */
export function usePullRequestDetail(id: number, repositoryIds: number[]) {
  const query = useQuery({
    queryKey: pullRequestKeys.detail(id),
    queryFn: ({ signal }) => getPullRequestDetail(id, signal),
  })
  const foreign =
    query.data !== undefined &&
    !repositoryIds.includes(query.data.repository.id)
  return {
    query,
    data: foreign ? null : (query.data ?? null),
    error: foreign
      ? '이 프로젝트에 연결된 PR이 아닙니다.'
      : query.isError
        ? query.error.message || 'PR 상세를 불러오지 못했습니다.'
        : '',
  }
}
