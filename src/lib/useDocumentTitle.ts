import { useEffect } from 'react'

const SERVICE_NAME = '갈피'

/** Each screen sets its own tab title on mount; the next screen replaces it. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${SERVICE_NAME} · ${title}`
  }, [title])
}
