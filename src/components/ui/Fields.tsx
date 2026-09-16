import {
  useId,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from 'react'
import { cn } from '../../lib/cn'
interface FieldProps {
  label: string
  hint?: string
  error?: string
  /** Sits beside the control, inside the label and hint. For a submit button
   * that belongs to this one field, such as "add by URL". */
  action?: ReactNode
  /** Hides the label visually only. The control keeps its accessible name, so
   * a toolbar can stay compact without becoming unlabelled. */
  hideLabel?: boolean
}
const control =
  'w-full rounded-lg border border-input bg-surface px-3 py-[9px] text-[13.5px] text-ink disabled:cursor-not-allowed disabled:bg-subtle disabled:opacity-60 aria-invalid:border-danger'
function Field({
  id,
  label,
  hint,
  error,
  required,
  action,
  hideLabel,
  children,
}: FieldProps & { id: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label
        htmlFor={id}
        className={cn(
          'text-[13px] font-bold text-body',
          hideLabel && 'sr-only',
        )}
      >
        {label}
        {required && (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {action ? (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">{children}</div>
          {action}
        </div>
      ) : (
        children
      )}
      {(hint || error) && (
        <p
          id={`${id}-description`}
          className={cn(
            'text-xs leading-relaxed',
            error ? 'text-danger' : 'text-muted',
          )}
        >
          {error || hint}
        </p>
      )}
    </div>
  )
}
export function Input({
  label,
  hint,
  error,
  hideLabel,
  action,
  id,
  className,
  ...props
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <Field
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      action={action}
      hideLabel={hideLabel}
      required={props.required}
    >
      <input
        {...props}
        id={fieldId}
        aria-invalid={!!error || undefined}
        aria-describedby={
          cn(
            props['aria-describedby'],
            (hint || error) && `${fieldId}-description`,
          ) || undefined
        }
        className={cn(control, className)}
      />
    </Field>
  )
}
export function Textarea({
  label,
  hint,
  error,
  id,
  className,
  ...props
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <Field
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      required={props.required}
    >
      <textarea
        rows={3}
        {...props}
        id={fieldId}
        aria-invalid={!!error || undefined}
        aria-describedby={
          cn(
            props['aria-describedby'],
            (hint || error) && `${fieldId}-description`,
          ) || undefined
        }
        className={cn(control, 'resize-y', className)}
      />
    </Field>
  )
}
export function Select({
  label,
  hint,
  error,
  hideLabel,
  id,
  className,
  children,
  ...props
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <Field
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      hideLabel={hideLabel}
      required={props.required}
    >
      <select
        {...props}
        id={fieldId}
        aria-invalid={!!error || undefined}
        aria-describedby={
          cn(
            props['aria-describedby'],
            (hint || error) && `${fieldId}-description`,
          ) || undefined
        }
        className={cn(control, className)}
      >
        {children}
      </select>
    </Field>
  )
}
export function Checkbox({
  label,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }) {
  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 text-[13px] text-body',
        className,
      )}
    >
      <input
        {...props}
        type="checkbox"
        className="size-4 rounded accent-primary disabled:cursor-not-allowed"
      />
      {label}
    </label>
  )
}
