export const API_PATHS = {
  githubAuthorize: '/auth/github/authorize',
  token: '/auth/token',
  refresh: '/auth/refresh',
  projects: '/projects',
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
