import type { MatchFilter } from './featureMatchApi'
import type { FeatureReviewFilter } from './featureReviewApi'

/**
 * Everything read for one project lives under `project(id)`, so a single
 * invalidation refreshes a screen without each part wiring its own reload.
 */
export const queryKeys = {
  projectList: () => ['projects'] as const,
  projectPage: (page: number) => ['projects', page] as const,
  githubRepositories: (projectId: number) =>
    ['github-repositories', projectId] as const,
  pullRequest: (id: number) => ['pull-request', id] as const,

  project: (projectId: number) => ['project', projectId] as const,
  overview: (
    projectId: number,
    repositoryKey: string,
    runId?: number,
    runStatus?: string,
  ) =>
    [
      'project',
      projectId,
      'overview',
      repositoryKey,
      runId,
      runStatus,
    ] as const,
  pullRequests: (projectId: number, options: Record<string, unknown>) =>
    ['project', projectId, 'pull-requests', options] as const,

  featureMatch: (projectId: number) =>
    ['project', projectId, 'feature-match'] as const,
  matchedFeatures: (projectId: number, specDocumentId: number) =>
    ['project', projectId, 'feature-match', 'stat', specDocumentId] as const,
  matchResults: (
    projectId: number,
    runId: number,
    runStatus: string,
    filter: MatchFilter,
    repositoryId?: number,
    q?: string,
  ) =>
    [
      'project',
      projectId,
      'feature-match',
      'results',
      runId,
      runStatus,
      filter,
      repositoryId,
      q,
    ] as const,
  matchDetail: (projectId: number, runId: number, featureId: number) =>
    [
      'project',
      projectId,
      'feature-match',
      'detail',
      runId,
      featureId,
    ] as const,
  unmatched: (projectId: number, runId: number, page: number) =>
    ['project', projectId, 'feature-match', 'unmatched', runId, page] as const,
  pullRequestFeatures: (
    projectId: number,
    pullRequestId: number,
    repositoryId: number,
  ) =>
    [
      'project',
      projectId,
      'feature-match',
      'pull-request',
      pullRequestId,
      repositoryId,
    ] as const,

  featureReview: (specDocumentId: number) =>
    ['feature-review', specDocumentId] as const,
  featureReviewSummary: (specDocumentId: number) =>
    ['feature-review', specDocumentId, 'summary'] as const,
  featureReviewLists: (specDocumentId: number) =>
    ['feature-review', specDocumentId, 'list'] as const,
  featureReviewList: (specDocumentId: number, filter: FeatureReviewFilter) =>
    ['feature-review', specDocumentId, 'list', filter] as const,
}
