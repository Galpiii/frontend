import { authenticatedFetch } from '../auth/session.ts'
import { projectPaths } from '../../lib/api.ts'

export const FEATURE_SPEC_MAX_BYTES = 20 * 1024 * 1024

export type FeatureSpecStage =
  'empty' | 'extracting' | 'ready' | 'failed' | 'unknown'

interface FeatureSpecDocumentLike {
  extractionStatus?: string
}

export function getFeatureSpecStage(
  document: FeatureSpecDocumentLike | null,
): FeatureSpecStage {
  if (!document) return 'empty'
  switch (document.extractionStatus?.toUpperCase()) {
    case 'PENDING':
    case 'PROCESSING':
      return 'extracting'
    case 'COMPLETED':
      return 'ready'
    case 'FAILED':
      return 'failed'
    default:
      return 'unknown'
  }
}

export function validateFeatureSpecFile(
  file: Pick<File, 'name' | 'size'>,
): string | null {
  if (!file.name.toLowerCase().endsWith('.pdf'))
    return 'PDF 파일만 등록할 수 있습니다.'
  if (file.size <= 0) return '비어 있는 파일은 등록할 수 없습니다.'
  if (file.size > FEATURE_SPEC_MAX_BYTES)
    return '파일 크기는 20MB 이하여야 합니다.'
  if (file.name.length > 255) return '파일 이름은 255자 이하여야 합니다.'
  return null
}

export class FeatureSpecUploadRejected extends Error {}
export class FeatureSpecUploadUnknown extends Error {}

export async function uploadFeatureSpec(
  projectId: number,
  file: File,
  signal?: AbortSignal,
) {
  return sendFeatureSpec(projectId, file, 'POST', signal)
}

export async function replaceFeatureSpec(projectId: number, file: File) {
  return sendFeatureSpec(projectId, file, 'PUT')
}

async function sendFeatureSpec(
  projectId: number,
  file: File,
  method: 'POST' | 'PUT',
  signal?: AbortSignal,
) {
  const body = new FormData()
  body.append('file', file)
  let response: Response
  try {
    response = await authenticatedFetch(projectPaths.featureSpecs(projectId), {
      method,
      body,
      signal,
    })
  } catch {
    throw new FeatureSpecUploadUnknown(
      '등록 결과를 확인하지 못했습니다. 중복 업로드를 막기 위해 서버 상태를 먼저 확인해주세요.',
    )
  }
  if (response.ok) return
  if (response.status >= 500 || [408, 425].includes(response.status))
    throw new FeatureSpecUploadUnknown(
      '등록 결과를 확인하지 못했습니다. 중복 업로드를 막기 위해 서버 상태를 먼저 확인해주세요.',
    )
  const message =
    response.status === 409
      ? method === 'PUT'
        ? '기능 추출 중이거나 문서가 변경되어 교체할 수 없습니다. 서버 상태를 확인해주세요.'
        : '이미 등록된 기능명세서가 있습니다. 서버 상태를 확인해주세요.'
      : response.status === 413
        ? '파일 크기는 20MB 이하여야 합니다.'
        : [400, 415, 422].includes(response.status)
          ? 'PDF 파일을 읽을 수 없습니다. 파일 형식과 암호 설정을 확인해주세요.'
          : '기능명세서를 등록하지 못했습니다. 잠시 후 다시 시도해주세요.'
  throw new FeatureSpecUploadRejected(message)
}
