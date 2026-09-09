import { exchangeLoginCode, restoreSession, SessionError } from './session.ts'

export type AuthResult = { authenticated: boolean; error?: string }

export interface CallbackInput {
  code: string | null
  failed: boolean
}

/** Called before React renders; never retain callback credentials in browser storage. */
export function consumeCallback(
  location: Pick<Location, 'href'>,
  history: Pick<History, 'replaceState' | 'state'>,
): CallbackInput {
  const url = new URL(location.href)
  const codes = url.searchParams.getAll('code')
  const failed = url.searchParams.has('error') || codes.length > 1
  const code = codes.length === 1 ? codes[0] : null
  const hasCallback =
    url.searchParams.has('code') || url.searchParams.has('error')
  if (hasCallback) {
    for (const key of [
      'code',
      'error',
      'error_description',
      'state',
      'returnTo',
    ])
      url.searchParams.delete(key)
    history.replaceState(
      history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    )
  }
  return { code, failed: failed || (codes.length === 1 && !code?.trim()) }
}

export async function initializeSession(
  input: CallbackInput,
): Promise<AuthResult> {
  if (input.failed)
    return {
      authenticated: false,
      error: 'GitHub 로그인이 취소되었거나 실패했습니다. 다시 로그인해주세요.',
    }
  try {
    if (input.code) await exchangeLoginCode(input.code)
    else await restoreSession()
    return { authenticated: true }
  } catch (error) {
    if (!input.code && error instanceof SessionError && error.status === 401)
      return { authenticated: false }
    return {
      authenticated: false,
      error: input.code
        ? '로그인 코드가 만료되었거나 교환에 실패했습니다. 다시 로그인해주세요.'
        : '로그인 상태를 확인하지 못했습니다. 다시 시도해주세요.',
    }
  }
}
