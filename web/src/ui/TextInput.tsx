import type { InputHTMLAttributes } from 'react'
import { useId } from 'react'

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  errorText?: string
}

/** A labeled text input with focus ring and aria wiring for hint/error text. */
export function TextInput({
  label,
  hint,
  errorText,
  id,
  className = '',
  ...props
}: TextInputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = errorText ? `${inputId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-describedby={describedBy}
        aria-invalid={errorText ? true : undefined}
        className={`rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${className}`.trim()}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {errorText && (
        <p id={errorId} className="text-xs text-accent-strong">
          {errorText}
        </p>
      )}
    </div>
  )
}
