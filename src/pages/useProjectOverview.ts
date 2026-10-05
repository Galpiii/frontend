import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { loadOverview } from '../lib/projectOverviewApi'
import type { ProjectDetail } from '../lib/projectApi'
import { queryKeys } from '../lib/queryKeys'

export function useProjectOverview(projectId: number, project?: ProjectDetail) {
  const queryClient = useQueryClient()
  const repositoryKey = project?.repositories
    .map((r) => r.repositoryId)
    .join(',')
  const runId = project?.lastAnalysis?.analysisRunId
  const runStatus = project?.lastAnalysis?.status
  const query = useQuery({
    queryKey: queryKeys.overview(
      projectId,
      repositoryKey ?? '',
      runId,
      runStatus,
    ),
    queryFn: ({ signal }) =>
      loadOverview(
        projectId,
        repositoryKey ? repositoryKey.split(',').map(Number) : [],
        runId,
        signal,
      ),
    enabled: repositoryKey !== undefined,
    // A new run or repository set keeps the last numbers on screen until the
    // new read lands, instead of blanking every card to "—".
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  })
  return {
    data: query.data ?? null,
    loading: query.isFetching,
    /** Re-reads everything shown for this project, not only the overview. */
    refresh: () =>
      void queryClient.invalidateQueries({
        queryKey: queryKeys.project(projectId),
      }),
  }
}
