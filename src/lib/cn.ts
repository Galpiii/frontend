/** Joins optional classes. Avoid conflicting utilities; use component variants. */
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
