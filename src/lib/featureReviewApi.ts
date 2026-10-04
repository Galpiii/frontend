import { authenticatedFetch } from '../auth/session.ts'
import { readData } from './api.ts'

export type FeatureReviewFilter =
  'ALL' | 'REVIEW_REQUIRED' | 'NO_ISSUE' | 'REVIEWED'

export type FeatureReviewStatus =
  'UNREVIEWED' | 'USER_CONFIRMED' | 'USER_MODIFIED'

export type FeatureIssueType =
  | 'DUPLICATE_SUSPECTED'
  | 'MISSING_REQUIREMENTS'
  | 'SPLIT_RECOMMENDED'
  | 'SOURCE_REVIEW_REQUIRED'
  | 'SOURCE_CONTENT_CONFLICT'

export interface FeatureRequirement {
  requirementId: number
  content: string
  sourceText: string | null
}

export interface FeatureReviewItem {
  featureId: number
  name: string
  reviewStatus: FeatureReviewStatus
  sourcePageStart: number | null
  sourcePageEnd: number | null
  requirements: FeatureRequirement[]
  issues: { issueType: FeatureIssueType; description: string }[]
  duplicateCandidates: {
    targetFeatureId: number
    targetFeatureName: string
    targetSourcePageStart: number | null
    targetSourcePageEnd: number | null
    targetRequirements: FeatureRequirement[]
    reason: string
    suggestedMergedName: string
    suggestedSection: string
  }[]
  splitSuggestions: {
    suggestionId: number
    suggestedName: string
    suggestedSection: string
    requirements: FeatureRequirement[]
  }[]
}

export interface FeatureReviewList {
  sections: {
    sectionId: number | null
    title: string | null
    features: FeatureReviewItem[]
  }[]
}

export interface FeatureReviewSummary {
  reviewRequired: number
  noIssue: number
  reviewed: number
  total: number
}

export interface FeatureUpdateInput {
  name?: string
  requirements?: { id?: number; content: string }[]
}

export interface FeatureSplitInput {
  features: { suggestionId: number; name: string }[]
}

export class FeatureReviewMutationRejected extends Error {}
export class FeatureReviewMutationUnknown extends Error {}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
const id = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const nullableId = (value: unknown) => value === null || id(value)
const nullablePage = (value: unknown) => value === null || id(value)
const nullableString = (value: unknown) =>
  value === null || typeof value === 'string'

function isRequirement(value: unknown): value is FeatureRequirement {
  return (
    object(value) &&
    id(value.requirementId) &&
    typeof value.content === 'string' &&
    nullableString(value.sourceText)
  )
}

const reviewStatuses: FeatureReviewStatus[] = [
  'UNREVIEWED',
  'USER_CONFIRMED',
  'USER_MODIFIED',
]
const issueTypes: FeatureIssueType[] = [
  'DUPLICATE_SUSPECTED',
  'MISSING_REQUIREMENTS',
  'SPLIT_RECOMMENDED',
  'SOURCE_REVIEW_REQUIRED',
  'SOURCE_CONTENT_CONFLICT',
]

function isFeature(value: unknown): value is FeatureReviewItem {
  return (
    object(value) &&
    id(value.featureId) &&
    typeof value.name === 'string' &&
    reviewStatuses.includes(value.reviewStatus as FeatureReviewStatus) &&
    nullablePage(value.sourcePageStart) &&
    nullablePage(value.sourcePageEnd) &&
    Array.isArray(value.requirements) &&
    value.requirements.every(isRequirement) &&
    Array.isArray(value.issues) &&
    value.issues.every(
      (issue) =>
        object(issue) &&
        issueTypes.includes(issue.issueType as FeatureIssueType) &&
        typeof issue.description === 'string',
    ) &&
    Array.isArray(value.duplicateCandidates) &&
    value.duplicateCandidates.every(
      (candidate) =>
        object(candidate) &&
        id(candidate.targetFeatureId) &&
        typeof candidate.targetFeatureName === 'string' &&
        nullablePage(candidate.targetSourcePageStart) &&
        nullablePage(candidate.targetSourcePageEnd) &&
        Array.isArray(candidate.targetRequirements) &&
        candidate.targetRequirements.every(isRequirement) &&
        typeof candidate.reason === 'string' &&
        typeof candidate.suggestedMergedName === 'string' &&
        typeof candidate.suggestedSection === 'string',
    ) &&
    Array.isArray(value.splitSuggestions) &&
    value.splitSuggestions.every(
      (suggestion) =>
        object(suggestion) &&
        id(suggestion.suggestionId) &&
        typeof suggestion.suggestedName === 'string' &&
        typeof suggestion.suggestedSection === 'string' &&
        Array.isArray(suggestion.requirements) &&
        suggestion.requirements.every(isRequirement),
    )
  )
}

function isFeatureReviewList(value: unknown): value is FeatureReviewList {
  return (
    object(value) &&
    Array.isArray(value.sections) &&
    value.sections.every(
      (section) =>
        object(section) &&
        nullableId(section.sectionId) &&
        nullableString(section.title) &&
        Array.isArray(section.features) &&
        section.features.every(isFeature),
    )
  )
}

function isFeatureReviewSummary(value: unknown): value is FeatureReviewSummary {
  return (
    object(value) &&
    count(value.reviewRequired) &&
    count(value.noIssue) &&
    count(value.reviewed) &&
    count(value.total) &&
    value.reviewRequired + value.noIssue + value.reviewed === value.total
  )
}

async function get<T>(
  path: string,
  guard: (value: unknown) => value is T,
  signal?: AbortSignal,
) {
  const response = await authenticatedFetch(path, {
    signal,
    cache: 'no-store',
  })
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? '기능명세서를 찾을 수 없거나 접근할 수 없습니다.'
        : '기능 목록을 불러오지 못했습니다.',
    )
  return readData(response, guard, '기능 목록 응답을 확인할 수 없습니다.')
}

export function getFeatureReviewSummary(
  specDocumentId: number,
  signal?: AbortSignal,
) {
  return get(
    `/feature-specs/${specDocumentId}/review-summary`,
    isFeatureReviewSummary,
    signal,
  )
}

export function getFeatureReviewList(
  specDocumentId: number,
  filter: FeatureReviewFilter,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  if (filter !== 'ALL') params.set('filter', filter)
  const query = params.size ? `?${params}` : ''
  return get(
    `/feature-specs/${specDocumentId}/features${query}`,
    isFeatureReviewList,
    signal,
  )
}

async function mutate(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
) {
  let response: Response
  try {
    response = await authenticatedFetch(path, {
      method,
      headers:
        body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new FeatureReviewMutationUnknown(
      '처리 결과를 확인하지 못했습니다. 요청을 다시 보내지 않고 기능 목록을 확인합니다.',
    )
  }
  if (response.ok) return
  if (response.status >= 500 || [408, 425].includes(response.status))
    throw new FeatureReviewMutationUnknown(
      '처리 결과를 확인하지 못했습니다. 요청을 다시 보내지 않고 기능 목록을 확인합니다.',
    )
  const message =
    response.status === 400
      ? '요청 내용을 적용할 수 없습니다. 최신 기능 목록과 입력 내용을 확인해주세요.'
      : response.status === 404
        ? '기능이 이미 변경되었거나 접근할 수 없습니다. 최신 목록을 확인해주세요.'
        : response.status === 409
          ? '다른 요청과 동시에 변경되어 처리하지 못했습니다. 최신 목록을 확인해주세요.'
          : '기능 검토 내용을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.'
  throw new FeatureReviewMutationRejected(message)
}

export function confirmAllFeatures(specDocumentId: number) {
  return mutate(`/feature-specs/${specDocumentId}/features/confirm-all`, 'POST')
}

export function confirmFeature(specDocumentId: number, featureId: number) {
  return mutate(
    `/feature-specs/${specDocumentId}/features/${featureId}/confirm`,
    'POST',
  )
}

export function updateFeature(
  specDocumentId: number,
  featureId: number,
  input: FeatureUpdateInput,
) {
  return mutate(
    `/feature-specs/${specDocumentId}/features/${featureId}`,
    'PATCH',
    input,
  )
}

export function mergeFeature(
  specDocumentId: number,
  featureId: number,
  targetFeatureId: number,
  name: string,
) {
  return mutate(
    `/feature-specs/${specDocumentId}/features/${featureId}/merge`,
    'POST',
    { targetFeatureId, name },
  )
}

export function splitFeature(
  specDocumentId: number,
  featureId: number,
  input: FeatureSplitInput,
) {
  return mutate(
    `/feature-specs/${specDocumentId}/features/${featureId}/split`,
    'POST',
    input,
  )
}

export function deleteFeature(specDocumentId: number, featureId: number) {
  return mutate(
    `/feature-specs/${specDocumentId}/features/${featureId}`,
    'DELETE',
  )
}
