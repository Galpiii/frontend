import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { cn } from '../../lib/cn'

/** Kept in JS and CSS at once so the open position can be computed unmeasured. */
const MENU_WIDTH = 190
const VIEWPORT_MARGIN = 8

export function MenuItem({
  tone = 'neutral',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'neutral' | 'danger' }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'block w-full px-4 py-2.5 text-left text-[13px] enabled:hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'danger' ? 'text-danger' : 'text-ink',
        className,
      )}
    />
  )
}

/**
 * A `⋯` dropdown built on the native popover, which supplies light dismiss,
 * Escape and top-layer stacking. Only placement is ours: a top-layer element is
 * positioned against the viewport, so it cannot be anchored with plain CSS
 * until anchor positioning is available everywhere.
 */
export function Menu({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = panel.current
    if (!element) return
    const close = () => {
      if (element.matches(':popover-open')) element.hidePopover()
    }
    const onToggle = () => {
      if (element.matches(':popover-open')) {
        window.addEventListener('scroll', close, true)
        window.addEventListener('resize', close)
      } else {
        window.removeEventListener('scroll', close, true)
        window.removeEventListener('resize', close)
      }
    }
    element.addEventListener('toggle', onToggle)
    return () => {
      element.removeEventListener('toggle', onToggle)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [])

  return (
    <>
      <button
        ref={trigger}
        type="button"
        popoverTarget={id}
        aria-label={label}
        className={cn(
          'rounded-lg border-0 bg-transparent px-2 py-0.5 text-[15px] leading-none text-faint transition-colors hover:bg-neutral-bg focus-visible:text-primary focus-visible:outline-none',
          className,
        )}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        style={{ width: MENU_WIDTH }}
        // The menu closes on scroll rather than following the trigger, so a
        // stale position can never be left floating over the page.
        onBeforeToggle={(event) => {
          if (event.newState !== 'open') return
          const box = trigger.current?.getBoundingClientRect()
          const element = panel.current
          if (!box || !element) return
          const right = innerWidth - MENU_WIDTH - VIEWPORT_MARGIN
          element.style.left = `${Math.max(VIEWPORT_MARGIN, Math.min(box.right - MENU_WIDTH, right))}px`
          element.style.top = `${box.bottom + 6}px`
        }}
        onClick={(event) => {
          // An item's own handler runs first; closing here keeps every caller
          // from repeating it.
          if ((event.target as HTMLElement).closest('button'))
            panel.current?.hidePopover()
        }}
        className="m-0 divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-surface p-0 shadow-dialog"
      >
        {children}
      </div>
    </>
  )
}
