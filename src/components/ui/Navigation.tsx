import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
export function FilterChip({
  selected = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      aria-pressed={selected}
      className={cn(
        'whitespace-nowrap rounded-full border px-[13px] py-1.5 text-[13px] font-semibold disabled:opacity-50',
        selected
          ? 'border-ink bg-ink text-white'
          : 'border-input bg-white text-body hover:bg-subtle',
        className,
      )}
    />
  )
}
export interface TabItem {
  value: string
  label: string
  content: ReactNode
  disabled?: boolean
}
export function Tabs({
  items,
  value,
  onValueChange,
  label,
}: {
  items: TabItem[]
  value: string
  onValueChange: (value: string) => void
  label: string
}) {
  const id = useId()
  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        className="flex overflow-x-auto border-b border-line"
      >
        {items.map((item) => (
          <button
            key={item.value}
            id={`${id}-tab-${item.value}`}
            type="button"
            role="tab"
            aria-selected={value === item.value}
            aria-controls={`${id}-panel-${item.value}`}
            tabIndex={value === item.value ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onValueChange(item.value)}
            onKeyDown={(event) => {
              const enabled = items.filter((tab) => !tab.disabled)
              const index = enabled.findIndex((tab) => tab.value === item.value)
              const next =
                event.key === 'ArrowRight'
                  ? enabled[(index + 1) % enabled.length]
                  : event.key === 'ArrowLeft'
                    ? enabled[(index - 1 + enabled.length) % enabled.length]
                    : event.key === 'Home'
                      ? enabled[0]
                      : event.key === 'End'
                        ? enabled.at(-1)
                        : undefined
              if (next) {
                event.preventDefault()
                onValueChange(next.value)
                document.getElementById(`${id}-tab-${next.value}`)?.focus()
              }
            }}
            className={cn(
              'whitespace-nowrap border-b-[3px] px-4 py-2 text-sm disabled:opacity-50',
              value === item.value
                ? 'border-primary font-extrabold text-ink'
                : 'border-transparent text-faint hover:text-ink',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item) => (
        <div
          key={item.value}
          id={`${id}-panel-${item.value}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${item.value}`}
          hidden={value !== item.value}
          tabIndex={0}
          className="pt-4"
        >
          {item.content}
        </div>
      ))}
    </div>
  )
}
export function Stepper({
  steps,
  current,
}: {
  steps: string[]
  current: number
}) {
  return (
    <ol aria-label="진행 단계" className="flex flex-wrap gap-3 text-[13px]">
      {steps.map((step, index) => (
        <li
          key={step}
          aria-current={index === current ? 'step' : undefined}
          className={cn(
            'flex items-center gap-3',
            index === current
              ? 'font-extrabold text-ink'
              : index < current
                ? 'text-primary'
                : 'text-faint',
          )}
        >
          <span
            className={cn(
              index === current &&
                'underline decoration-primary decoration-2 underline-offset-8',
            )}
          >
            {index < current ? '✓' : `${index + 1}.`} {step}
          </span>
          {index < steps.length - 1 && (
            <span aria-hidden="true" className="text-input">
              ─
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}
