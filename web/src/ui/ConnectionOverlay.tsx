import { useEffect, useState } from 'react'

import type { ConnectionStatus } from '../store'

export interface ConnectionOverlayProps {
  status: ConnectionStatus
}

/** How long to wait on the initial connect before showing the cold-start copy. */
const WAKING_DELAY_MS = 3000

/**
 * A non-blocking banner shown while the socket is connecting or reconnecting.
 * The backend runs on a free tier that can cold-start, so a plain "Connecting..."
 * that lingers reads as broken; after a few seconds it switches to a friendlier
 * "waking the demo" message. While reconnecting after a dropped connection, the
 * copy says so immediately instead of following the same delay. `role="status"`
 * plus `aria-live="polite"` announce the state without stealing focus.
 */
export function ConnectionOverlay({ status }: ConnectionOverlayProps) {
  const [waking, setWaking] = useState(false)

  useEffect(() => {
    if (status !== 'connecting') {
      setWaking(false)
      return
    }
    const timer = setTimeout(() => setWaking(true), WAKING_DELAY_MS)
    return () => clearTimeout(timer)
  }, [status])

  if (status !== 'connecting' && status !== 'reconnecting') return null

  const message =
    status === 'reconnecting'
      ? 'Reconnecting...'
      : waking
        ? 'Waking the demo (the free server may be cold-starting)...'
        : 'Connecting...'

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center p-4">
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink shadow-[0_1px_2px_rgba(27,30,40,0.06),0_10px_28px_-14px_rgba(27,30,40,0.35)]"
      >
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent motion-safe:animate-pulse"
        />
        <span>{message}</span>
      </div>
    </div>
  )
}
