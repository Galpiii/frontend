/**
 * Everything read for one project lives under `detail(id)`, so a single
 * invalidation of that prefix refreshes a screen without each part wiring its
 * own reload. Other features build their project-scoped keys on it.
 */
export const projectKeys = {
  lists: () => ['projects'] as const,
  page: (page: number) => ['projects', page] as const,
  detail: (projectId: number) => ['project', projectId] as const,
  overview: (
    projectId: number,
    repositoryKey: string,
    runId?: number,
    runStatus?: string,
  ) =>
    [
      ...projectKeys.detail(projectId),
      'overview',
      repositoryKey,
      runId,
      runStatus,
    ] as const,
}
