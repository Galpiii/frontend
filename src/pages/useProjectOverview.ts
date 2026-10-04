import { useEffect, useState } from 'react'
import { loadOverview } from '../lib/projectOverviewApi'
import type { ProjectDetail } from '../lib/projectApi'

export function useProjectOverview(projectId: number, project?: ProjectDetail) {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof loadOverview>
  > | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(false)
  const repositoryKey = project?.repositories
    .map((r) => r.repositoryId)
    .join(',')
  const runId = project?.lastAnalysis?.analysisRunId
  const runStatus = project?.lastAnalysis?.status
  useEffect(() => {
    if (repositoryKey === undefined) return
    const controller = new AbortController()
    let timer: number | undefined
    async function load() {
      setLoading(true)
      try {
        const result = await loadOverview(
          projectId,
          repositoryKey ? repositoryKey.split(',').map(Number) : [],
          runId,
          controller.signal,
        )
        if (!controller.signal.aborted) setData(result)
      } catch {
        if (!controller.signal.aborted) setData(null)
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          timer = window.setTimeout(() => void load(), 15000)
        }
      }
    }
    void load()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [projectId, repositoryKey, runId, runStatus, attempt])
  return { data, loading, refresh: () => setAttempt((v) => v + 1) }
}
