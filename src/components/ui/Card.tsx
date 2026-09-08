import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        'rounded-xl border border-line bg-surface p-[18px]',
        className,
      )}
    />
  )
}
export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-[22px] font-extrabold tracking-[-.4px]">{title}</h2>
        {description && (
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
export function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: ReactNode
  hint?: string
}) {
  return (
    <Card>
      <div className="text-[28px] font-extrabold tracking-tight">{value}</div>
      <div className="mt-1 text-[13px] text-muted">{label}</div>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </Card>
  )
}
