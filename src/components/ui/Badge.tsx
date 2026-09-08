import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { tones, type Tone } from './tones'
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}
export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-[9px] py-0.5 text-xs font-bold',
        tones[tone],
        className,
      )}
    />
  )
}
