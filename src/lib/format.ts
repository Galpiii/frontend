/** Only an HTTPS github.com address may become a link to the source. */
export function githubUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'github.com'
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

/** An absent or unparseable timestamp reads as "기록 없음", never "Invalid Date". */
export function displayDate(value?: string | null) {
  if (!value) return '기록 없음'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '기록 없음'
    : date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}
