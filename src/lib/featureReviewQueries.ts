import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { configureFeatureReviewReads } from '../analysis/featureReview'
import {
  getFeatureReviewList,
  getFeatureReviewSummary,
  type FeatureReviewFilter,
} from './featureReviewApi'
import { queryKeys } from './queryKeys'

export const featureReviewSummaryQuery = (specDocumentId: number) =>
  queryOptions({
    queryKey: queryKeys.featureReviewSummary(specDocumentId),
    queryFn: ({ signal }) => getFeatureReviewSummary(specDocumentId, signal),
  })

export const featureReviewListQuery = (
  specDocumentId: number,
  filter: FeatureReviewFilter,
) =>
  queryOptions({
    queryKey: queryKeys.featureReviewList(specDocumentId, filter),
    queryFn: ({ signal }) =>
      getFeatureReviewList(specDocumentId, filter, signal),
  })

/**
 * Routes the review owner's reconciliation into the cache, so the screen
 * renders the very response that confirmed a mutation instead of asking again.
 *
 * The owner reads directly rather than through `fetchQuery`: a screen that
 * unmounts mid-read cancels a cached fetch, and a cancelled fetch resolves
 * with the old data, which would release the lock on a pre-mutation list.
 */
export function connectFeatureReviewCache(client: QueryClient) {
  configureFeatureReviewReads({
    list: async (id) => {
      // A screen read already in flight may predate the mutation; drop it.
      await client.cancelQueries({ queryKey: queryKeys.featureReview(id) })
      const filters = new Set<FeatureReviewFilter>(['ALL'])
      for (const query of client.getQueryCache().findAll({
        queryKey: queryKeys.featureReviewLists(id),
        type: 'active',
      }))
        filters.add(query.queryKey[3] as FeatureReviewFilter)
      await Promise.all(
        [...filters].map(async (filter) =>
          client.setQueryData(
            queryKeys.featureReviewList(id, filter),
            await getFeatureReviewList(id, filter),
          ),
        ),
      )
      // Lists nobody is showing are read again when a screen next needs them.
      await client.invalidateQueries({
        queryKey: queryKeys.featureReviewLists(id),
        refetchType: 'none',
        predicate: (query) =>
          !filters.has(query.queryKey[3] as FeatureReviewFilter),
      })
    },
    summary: async (id) => {
      client.setQueryData(
        queryKeys.featureReviewSummary(id),
        await getFeatureReviewSummary(id),
      )
    },
  })
}
