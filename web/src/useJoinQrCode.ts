import { useEffect, useState } from 'react'
import * as QRCode from 'qrcode'

export interface JoinQrCode {
  /** A `data:image/png` URL once generated, otherwise null (pending or unset). */
  dataUrl: string | null
  /** True if the most recent generation attempt failed. */
  error: boolean
}

/**
 * Generates a QR-code data URL for `url` in an effect. Renders nothing while
 * pending; if generation throws (e.g. no canvas support in the environment)
 * it tolerates the failure and reports `error` instead of crashing.
 */
export function useJoinQrCode(url: string | null): JoinQrCode {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setDataUrl(null)
    setError(false)
    if (!url) return

    let cancelled = false
    QRCode.toDataURL(url)
      .then((generated) => {
        if (!cancelled) setDataUrl(generated)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
  }, [url])

  return { dataUrl, error }
}
