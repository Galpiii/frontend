import { projectKeys } from '../projects/keys'
import type { MatchFilter } from './api'

/** Connecting or unlinking a PR invalidates `all(projectId)`. */
export const matchKeys = {
  all: (projectId: number) =>
    [...projectKeys.detail(projectId), 'feature-match'] as const,
  stat: (projectId: number, specDocumentId: number) =>
    [...matchKeys.all(projectId), 'stat', specDocumentId] as const,
  results: (
    projectId: number,
    runId: number,
    runStatus: string,
    filter: MatchFilter,
    repositoryId?: number,
    q?: string,
  ) =>
    [
      ...matchKeys.all(projectId),
      'results',
      runId,
      runStatus,
      filter,
      repositoryId,
      q,
    ] as const,
  detail: (projectId: number, runId: number, featureId: number) =>
    [...matchKeys.all(projectId), 'detail', runId, featureId] as const,
  unmatched: (projectId: number, runId: number, page: number) =>
    [...matchKeys.all(projectId), 'unmatched', runId, page] as const,
  pullRequestFeatures: (
    projectId: number,
    pullRequestId: number,
    repositoryId: number,
  ) =>
    [
      ...matchKeys.all(projectId),
      'pull-request',
      pullRequestId,
      repositoryId,
    ] as const,
}
