export const tones = {
  neutral: 'text-neutral bg-neutral-bg border-neutral-border',
  info: 'text-info bg-info-bg border-info-border',
  success: 'text-success bg-success-bg border-success-border',
  warning: 'text-warning bg-warning-bg border-warning-border',
  danger: 'text-danger bg-danger-bg border-danger-border',
  accent: 'text-accent bg-accent-bg border-accent-border',
} as const
export type Tone = keyof typeof tones
