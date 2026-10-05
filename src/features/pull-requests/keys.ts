import { projectKeys } from '../projects/keys'

export const pullRequestKeys = {
  detail: (id: number) => ['pull-request', id] as const,
  list: (projectId: number, options: Record<string, unknown>) =>
    [...projectKeys.detail(projectId), 'pull-requests', options] as const,
}
