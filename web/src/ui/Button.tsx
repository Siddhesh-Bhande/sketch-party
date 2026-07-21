import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const BASE_CLASSES =
  'inline-flex items-center justify-center rounded-xl px-5 py-3 font-sans text-sm font-semibold ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-50'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'border border-ink bg-ink text-paper hover:bg-ink/90',
  secondary: 'border border-line bg-surface text-ink hover:bg-paper',
  ghost: 'border border-transparent bg-transparent text-ink hover:bg-surface',
}

/** A keyboard-focusable button with three solid-color variants. No gradients. */
export function Button({ variant = 'primary', className = '', type, ...props }: ButtonProps) {
  const classes = `${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`.trim()
  return <button type={type ?? 'button'} className={classes} {...props} />
}
