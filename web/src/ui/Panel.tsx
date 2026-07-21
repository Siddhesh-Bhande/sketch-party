import type { HTMLAttributes } from 'react'

export type PanelProps = HTMLAttributes<HTMLDivElement>

/** A white rounded card: hairline border plus a soft shadow, never a gradient. */
export function Panel({ className = '', ...props }: PanelProps) {
  const classes =
    `rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(27,30,40,0.06),0_10px_28px_-14px_rgba(27,30,40,0.35)] ${className}`.trim()
  return <div className={classes} {...props} />
}
