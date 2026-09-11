import type { ReactNode } from 'react'
import { tones, type Tone } from './tones'
import { cn } from '../../lib/cn'
import { IconButton } from './Button'
export function Alert({
  title,
  children,
  tone = 'info',
  action,
}: {
  title?: string
  children: ReactNode
  tone?: Tone
  action?: ReactNode
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-[10px] border px-4 py-3 text-[13px] leading-relaxed',
        tones[tone],
      )}
    >
      <div>
        {title && <p className="mb-1 font-bold">{title}</p>}
        {children}
      </div>
      {action}
    </div>
  )
}
export function EmptyState({
  title,
  description,
  action,
  icon = '◆',
  level = 3,
}: {
  title: string
  description: string
  action?: ReactNode
  icon?: ReactNode
  /** Pick the level that fits the page outline; the size stays the same. */
  level?: 2 | 3 | 4
}) {
  const Heading = `h${level}` as const
  return (
    <div className="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-accent-border bg-subtle px-6 py-9 text-center">
      <span
        aria-hidden="true"
        className="flex size-11 items-center justify-center rounded-xl bg-accent-bg text-xl text-primary"
      >
        {icon}
      </span>
      <Heading className="text-[15px] font-extrabold">{title}</Heading>
      <p className="max-w-lg text-[13px] leading-relaxed text-muted">
        {description}
      </p>
      {action}
    </div>
  )
}
export function Progress({ label, value }: { label: string; value: number }) {
  const percent = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-3 text-[13px]">
        <span>{label}</span>
        <span className="text-muted">{Math.round(percent)}%</span>
      </div>
      <progress
        aria-label={label}
        value={percent}
        max={100}
        className="block h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-neutral-bg [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
      />
    </div>
  )
}
export function Toast({
  message,
  onDismiss,
  tone = 'success',
}: {
  message: string | null
  onDismiss: () => void
  tone?: Tone
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed inset-x-4 bottom-6 z-[100] flex justify-center pointer-events-none"
    >
      {message && (
        <div
          className={cn(
            'pointer-events-auto flex max-w-lg items-center gap-4 rounded-[10px] border px-4 py-2 shadow-dialog',
            tones[tone],
          )}
        >
          <span>{message}</span>
          <IconButton label="알림 닫기" onClick={onDismiss}>
            ×
          </IconButton>
        </div>
      )}
    </div>
  )
}
