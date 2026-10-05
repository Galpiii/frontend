import type { FeatureReviewFilter } from './api'

export const reviewKeys = {
  document: (specDocumentId: number) =>
    ['feature-review', specDocumentId] as const,
  summary: (specDocumentId: number) =>
    [...reviewKeys.document(specDocumentId), 'summary'] as const,
  lists: (specDocumentId: number) =>
    [...reviewKeys.document(specDocumentId), 'list'] as const,
  list: (specDocumentId: number, filter: FeatureReviewFilter) =>
    [...reviewKeys.lists(specDocumentId), filter] as const,
}
