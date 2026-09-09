import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'dark' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
}
const variants = {
  primary: 'border-primary-border bg-primary text-white hover:bg-primary-hover',
  secondary: 'border-input bg-surface text-ink hover:bg-subtle',
  dark: 'border-ink bg-ink text-white hover:opacity-90',
  ghost: 'border-transparent bg-transparent text-muted hover:bg-neutral-bg',
  danger: 'border-danger-border bg-danger-bg text-danger hover:brightness-95',
}
const sizes = {
  sm: 'rounded-lg px-3 py-1.5 text-[13px]',
  md: 'rounded-[9px] px-4 py-2.5 text-[13.5px]',
  lg: 'rounded-[10px] px-6 py-3 text-[15px]',
}
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 border font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
        />
      ) : (
        icon
      )}
      {children}
    </button>
  )
}
export function IconButton({
  label,
  children,
  ...props
}: Omit<ButtonProps, 'aria-label' | 'icon'> & { label: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      {...props}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  )
}
