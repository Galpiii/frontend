import { useEffect, useState } from 'react'
import { AnalysisFlow, type FlowState } from './analysisFlow'

export function useAnalysisStart() {
  const [state, setState] = useState<FlowState>({
    phase: 'idle',
    checked: false,
  })
  const [flow] = useState(() => new AnalysisFlow(setState))
  useEffect(() => {
    flow.activate()
    return () => flow.cancel(true)
  }, [flow])
  return { flow, state }
}
