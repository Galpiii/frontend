import { API_PATHS, getApiUrl } from '../lib/api.ts'

const REQUEST_TIMEOUT_MS = 15_000

let accessToken: string | null = null
let expiresAt = 0
let refreshRequest: Promise<void> | null = null

/** Every backend call is bounded; a caller's own signal still aborts first. */
function withTimeout(signal?: AbortSignal | null) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

const unauthorizedListeners = new Set<() => void>()

/**
 * Fires when a session that was already established is rejected. The initial
 * bootstrap restore is excluded: a logged-out first visit is not an expiry.
 */
export function onUnauthorized(listener: () => void) {
  unauthorizedListeners.add(listener)
  return () => {
    unauthorizedListeners.delete(listener)
  }
}

function expireSession() {
  accessToken = null
  expiresAt = 0
  for (const listener of unauthorizedListeners) listener()
}

export class SessionError extends Error {
  status: number
  constructor(status: number) {
    super('인증 요청을 완료하지 못했습니다. 다시 로그인해주세요.')
    this.status = status
  }
}

async function receiveToken(path: string, code?: string) {
  const response = await fetch(getApiUrl(path), {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    signal: withTimeout(),
    headers: { 'Content-Type': 'application/json', 'X-Galpi-Request': 'true' },
    ...(code !== undefined ? { body: JSON.stringify({ code }) } : {}),
  })
  if (!response.ok) throw new SessionError(response.status)
  const body = await response.json()
  const data = body?.data
  if (
    typeof data?.accessToken !== 'string' ||
    !data.accessToken ||
    data.tokenType !== 'Bearer' ||
    !Number.isFinite(data.expiresIn) ||
    data.expiresIn <= 0
  ) {
    throw new Error('로그인 응답을 확인할 수 없습니다. 다시 로그인해주세요.')
  }
  accessToken = data.accessToken
  expiresAt = Date.now() + data.expiresIn * 1000
}

export function exchangeLoginCode(code: string) {
  // One-time exchange: do not retry after a network failure or consumed code.
  return receiveToken(API_PATHS.token, code)
}

export function restoreSession() {
  if (!refreshRequest) {
    refreshRequest = receiveToken(API_PATHS.refresh)
      .catch((error) => {
        accessToken = null
        expiresAt = 0
        throw error
      })
      .finally(() => {
        refreshRequest = null
      })
  }
  return refreshRequest
}

export async function authenticatedFetch(path: string, init: RequestInit = {}) {
  if (!accessToken || expiresAt <= Date.now() + 10_000) {
    try {
      await restoreSession()
    } catch (error) {
      // Only a rejected session is an expiry; a 5xx stays a request failure.
      if (error instanceof SessionError && error.status === 401) expireSession()
      throw error
    }
  }
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  // No automatic replay of mutations: avoid creating a project twice.
  const response = await fetch(getApiUrl(path), {
    ...init,
    headers,
    credentials: 'include',
    signal: withTimeout(init.signal),
  })
  if (response.status === 401) {
    expireSession()
    throw new SessionError(401)
  }
  return response
}
