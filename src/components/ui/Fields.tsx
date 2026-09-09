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
}
const control =
  'w-full rounded-lg border border-input bg-surface px-3 py-[9px] text-[13.5px] text-ink disabled:cursor-not-allowed disabled:bg-subtle disabled:opacity-60 aria-invalid:border-danger'
function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: FieldProps & { id: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-bold text-body">
        {label}
        {required && (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
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
