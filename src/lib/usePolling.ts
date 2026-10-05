import { useEffect, useRef } from 'react'

/**
 * Repeats a status read for the owners in `analysis/`, which keep their own
 * state outside the query cache. Like a query's refetchInterval, it pauses in
 * a hidden tab and reads once as soon as the tab is visible again.
 */
export function usePolling(
  read: () => void,
  intervalMs: number,
  enabled = true,
) {
  const latest = useRef(read)
  useEffect(() => {
    latest.current = read
  })
  useEffect(() => {
    if (!enabled) return
    let timer: number | undefined
    const stop = () => window.clearInterval(timer)
    const start = () => {
      stop()
      if (!document.hidden)
        timer = window.setInterval(() => latest.current(), intervalMs)
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else {
        latest.current()
        start()
      }
    }
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs, enabled])
}
