import { API_PATHS, getApiUrl } from '../lib/api.ts'

let accessToken: string | null = null
let expiresAt = 0
let refreshRequest: Promise<void> | null = null

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
    signal: AbortSignal.timeout(15_000),
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
  if (!accessToken || expiresAt <= Date.now() + 10_000) await restoreSession()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  // No automatic replay of mutations: avoid creating a project twice.
  const response = await fetch(getApiUrl(path), {
    ...init,
    headers,
    credentials: 'include',
  })
  if (response.status === 401) {
    accessToken = null
    expiresAt = 0
    throw new SessionError(401)
  }
  return response
}
