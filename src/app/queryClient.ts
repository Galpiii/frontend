import { QueryClient } from '@tanstack/react-query'
import { SessionError } from '../features/auth/session'
import { MatchApiError } from '../features/feature-match/api'
import { ProjectNotFound } from '../features/projects/api'

/**
 * Server reads only. Mutations stay with the owners in `analysis/`, which must
 * never replay a request whose outcome is unknown.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // One retry for a flaky read; a definite answer is not asked twice.
      retry: (failureCount, error) =>
        failureCount < 1 &&
        !(error instanceof SessionError) &&
        !(error instanceof ProjectNotFound) &&
        !(error instanceof MatchApiError && error.status < 500),
    },
  },
})
