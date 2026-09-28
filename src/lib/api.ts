export const API_PATHS = {
  aiConsent: '/consents/ai-data',
  githubAuthorize: '/auth/github/authorize',
  token: '/auth/token',
  refresh: '/auth/refresh',
  projects: '/projects',
  githubRepositories: '/github/repositories',
  githubInstallUrl: '/github/install-url',
} as const

/** Paths scoped to one project; the id always comes from a route param. */
export const projectPaths = {
  project: (projectId: number) => `/projects/${projectId}`,
  analyses: (projectId: number) => `/projects/${projectId}/analyses`,
  featureSpecs: (projectId: number) => `/projects/${projectId}/feature-specs`,
  repositories: (projectId: number) => `/projects/${projectId}/repositories`,
  resolveRepository: (projectId: number) =>
    `/projects/${projectId}/repositories/resolve`,
} as const

/** VITE_API_BASE_URL is the backend origin, without an API path prefix. */
export function getApiUrl(path: string) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  if (!baseUrl) throw new Error('Missing API base URL')
  const url = new URL(path, baseUrl)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Invalid API base URL')
  }
  return url.href
}

/**
 * Reads the backend's `{ data }` envelope. A response body is untrusted, so a
 * caller declares the shape it needs and anything else becomes a rejection
 * instead of reaching the screen. HTTP status stays the caller's concern:
 * each one maps failures onto its own error type.
 */
export async function readData<T>(
  response: Response,
  isValid: (value: unknown) => value is T,
  invalidMessage: string,
): Promise<T> {
  const body: unknown = await response.json().catch(() => null)
  const data = (body as { data?: unknown } | null)?.data
  if (!isValid(data)) throw new Error(invalidMessage)
  return data
}
