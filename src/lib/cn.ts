import { twMerge } from 'tailwind-merge'

/**
 * Joins classes and resolves Tailwind conflicts, so a caller's `className`
 * reliably overrides a component default. Plain string order cannot do this:
 * Tailwind decides by the generated stylesheet's order, not by class order.
 */
export function cn(...classes: (string | false | null | undefined)[]) {
  return twMerge(classes)
}
