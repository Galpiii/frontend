import { useId, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'

export function CollectionNotice({
  notices,
  children,
  className,
}: {
  notices: string[]
  children: ReactNode
  className?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()

  return (
    <section
      className={cn(
        'grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2 text-xs text-warning',
        className,
      )}
      aria-label="수집 근거 제한"
    >
      <span className="whitespace-nowrap leading-relaxed">수집 근거 제한:</span>
      <div className="min-w-0 space-y-1 break-words leading-relaxed">
        {notices.map((notice) => (
          <p key={notice}>{notice}</p>
        ))}
      </div>
      <button
        type="button"
        aria-label={expanded ? '분석 제외 파일 접기' : '분석 제외 파일 펼치기'}
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
        className="-mt-1 flex size-8 items-center justify-center rounded-md bg-transparent text-warning focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className={cn('size-4', expanded && 'rotate-180')}
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div
        id={contentId}
        hidden={!expanded}
        className="col-span-2 col-start-2 min-w-0 text-muted"
      >
        {expanded && children}
      </div>
    </section>
  )
}
