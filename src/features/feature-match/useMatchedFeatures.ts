import { useQuery } from '@tanstack/react-query'
import { getLatestMatchRun, getMatchResults, MatchApiError } from './api'
import type { ProjectDetail } from '../projects/api'
import { matchKeys } from './keys'

export type MatchedFeatures =
  | { state: 'NO_SPEC' | 'NO_RUN' | 'FAILED' | 'STALE' | 'ERROR' }
  | { state: 'IN_PROGRESS'; progressPercent: number }
  | { state: 'READY'; matched: number; total: number }

async function loadMatchedFeatures(
  projectId: number,
  specDocumentId: number,
  signal: AbortSignal,
): Promise<MatchedFeatures> {
  try {
    const run = await getLatestMatchRun(projectId, signal)
    if (!run) return { state: 'NO_RUN' }
    if (run.specDocumentId !== specDocumentId) return { state: 'STALE' }
    if (['QUEUED', 'RUNNING'].includes(run.status))
      return { state: 'IN_PROGRESS', progressPercent: run.progressPercent }
    if (['FAILED', 'CANCELLED'].includes(run.status)) return { state: 'FAILED' }
    const { summary } = await getMatchResults(
      projectId,
      'ALL',
      undefined,
      undefined,
      signal,
    )
    return {
      state: 'READY',
      matched: summary.evidenceFoundFeatureCount,
      total: summary.totalFeatureCount,
    }
  } catch (error) {
    signal.throwIfAborted()
    return error instanceof MatchApiError && error.code === 'FEATURE-MATCH-010'
      ? { state: 'STALE' }
      : { state: 'ERROR' }
  }
}

export function useMatchedFeatures(project?: ProjectDetail) {
  const projectId = project?.id
  const specDocumentId = project?.specDocument?.specDocumentId
  const query = useQuery({
    queryKey: matchKeys.stat(projectId ?? 0, specDocumentId ?? 0),
    queryFn: ({ signal }) =>
      loadMatchedFeatures(projectId!, specDocumentId!, signal),
    enabled: projectId !== undefined && !!specDocumentId,
    // Only a running match changes on its own; anything else waits for a refresh.
    refetchInterval: (query) =>
      query.state.data?.state === 'IN_PROGRESS' ? 5000 : false,
  })
  if (project && !specDocumentId) return { state: 'NO_SPEC' } as const
  return query.data ?? null
}
