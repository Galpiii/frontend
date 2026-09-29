import { authenticatedFetch } from '../auth/session.ts'
import { API_PATHS, readData } from './api.ts'

export interface AiConsent {
  currentVersion: string
  notice: string
  agreed: boolean
  agreedVersion: string | null
  /** Optional contract extension; absent on legacy Git-only notices. */
  coveredData?: string[]
}

export class ConsentRequired extends Error {}
export class ConsentVersionChanged extends Error {}

function isConsent(value: unknown): value is AiConsent {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.currentVersion === 'string' &&
    item.currentVersion.trim() !== '' &&
    typeof item.notice === 'string' &&
    item.notice.trim() !== '' &&
    typeof item.agreed === 'boolean' &&
    (item.agreedVersion === null || typeof item.agreedVersion === 'string') &&
    (item.coveredData === undefined ||
      (Array.isArray(item.coveredData) &&
        item.coveredData.every((scope) => typeof scope === 'string')))
  )
}

export async function getAiConsent(signal?: AbortSignal) {
  const response = await authenticatedFetch(API_PATHS.aiConsent, {
    signal,
    cache: 'no-store',
  })
  if (!response.ok)
    throw new Error('동의 정보를 불러오지 못했습니다. 다시 시도해주세요.')
  return readData(
    response,
    isConsent,
    '동의 정보를 확인할 수 없습니다. 다시 시도해주세요.',
  )
}

export async function agreeAiConsent(
  consentVersion: string,
  signal?: AbortSignal,
) {
  const response = await authenticatedFetch(API_PATHS.aiConsent, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ consentVersion }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    if (response.status === 409 && body?.code === 'CONSENT-002')
      throw new ConsentVersionChanged()
    throw new Error('동의를 저장하지 못했습니다. 다시 시도해주세요.')
  }
  const result = await readData(
    response,
    isConsent,
    '동의 저장 결과를 확인할 수 없습니다.',
  )
  if (
    !result.agreed ||
    result.currentVersion !== consentVersion ||
    result.agreedVersion !== consentVersion
  )
    throw new ConsentVersionChanged()
  return result
}
