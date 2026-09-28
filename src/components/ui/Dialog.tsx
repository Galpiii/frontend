import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { IconButton } from './Button'
export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  closeDisabled?: boolean
  closeOnBackdrop?: boolean
}
function Overlay({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeDisabled = false,
  closeOnBackdrop = true,
  drawer = false,
}: DialogProps & { drawer?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onCancel={(event) => {
        event.preventDefault()
        if (!closeDisabled) onClose()
      }}
      onClick={(event) => {
        if (
          !closeOnBackdrop ||
          closeDisabled ||
          event.target !== event.currentTarget
        )
          return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose()
      }}
      className={cn(
        'fixed border border-line bg-surface p-0 text-ink shadow-dialog',
        drawer
          ? 'inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-[480px] max-w-[94vw]'
          : 'inset-0 m-auto max-h-[90dvh] w-[520px] max-w-[calc(100vw-32px)] rounded-[14px]',
      )}
    >
      <div
        className={cn(
          'flex max-h-[90dvh] flex-col',
          drawer && 'h-dvh max-h-dvh',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 id={`${id}-title`} className="text-lg font-extrabold">
              {title}
            </h2>
            {description && (
              <p
                id={`${id}-description`}
                className="mt-1 text-[13px] leading-relaxed text-muted"
              >
                {description}
              </p>
            )}
          </div>
          <IconButton label="닫기" onClick={onClose} disabled={closeDisabled}>
            ×
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  )
}
export function Modal(props: DialogProps) {
  return <Overlay {...props} />
}
export function Drawer(props: DialogProps) {
  return <Overlay {...props} drawer />
}
