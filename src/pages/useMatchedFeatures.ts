import { useEffect, useState } from 'react'
import {
  getLatestMatchRun,
  getMatchResults,
  MatchApiError,
} from '../lib/featureMatchApi'
import type { ProjectDetail } from '../lib/projectApi'

export type MatchedFeatures =
  | { state: 'NO_SPEC' | 'NO_RUN' | 'FAILED' | 'STALE' | 'ERROR' }
  | { state: 'IN_PROGRESS'; progressPercent: number }
  | { state: 'READY'; matched: number; total: number }

export function useMatchedFeatures(project?: ProjectDetail, refreshKey = 0) {
  const projectId = project?.id
  const specDocumentId = project?.specDocument?.specDocumentId
  const key = `${projectId}:${specDocumentId}`
  const [response, setResponse] = useState<{
    key: string
    data: MatchedFeatures
  } | null>(null)
  useEffect(() => {
    if (projectId === undefined || !specDocumentId) return
    const controller = new AbortController()
    let timer: number | undefined
    async function load(projectId: number) {
      let next: MatchedFeatures
      try {
        const run = await getLatestMatchRun(projectId, controller.signal)
        if (!run) next = { state: 'NO_RUN' }
        else if (run.specDocumentId !== specDocumentId)
          next = { state: 'STALE' }
        else if (['QUEUED', 'RUNNING'].includes(run.status))
          next = {
            state: 'IN_PROGRESS',
            progressPercent: run.progressPercent,
          }
        else if (['FAILED', 'CANCELLED'].includes(run.status))
          next = { state: 'FAILED' }
        else {
          const { summary } = await getMatchResults(
            projectId,
            'ALL',
            undefined,
            undefined,
            controller.signal,
          )
          next = {
            state: 'READY',
            matched: summary.evidenceFoundFeatureCount,
            total: summary.totalFeatureCount,
          }
        }
      } catch (error) {
        next =
          error instanceof MatchApiError && error.code === 'FEATURE-MATCH-010'
            ? { state: 'STALE' }
            : { state: 'ERROR' }
      }
      if (controller.signal.aborted) return
      setResponse({ key, data: next })
      if (next.state === 'IN_PROGRESS')
        timer = window.setTimeout(() => void load(projectId), 5000)
    }
    void load(projectId)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [projectId, specDocumentId, key, refreshKey])
  if (project && !specDocumentId) return { state: 'NO_SPEC' } as const
  return response?.key === key ? response.data : null
}
