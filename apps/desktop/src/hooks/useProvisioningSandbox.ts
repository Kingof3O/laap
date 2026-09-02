import { useEffect } from 'react'

interface UseProvisioningSandboxOptions {
  active: boolean
  pollFn: () => Promise<string | null>
  onCapture: (capturedSession: string) => Promise<void>
  onError: (err: Error) => void
  intervalMs?: number
}

export function useProvisioningSandbox({
  active,
  pollFn,
  onCapture,
  onError,
  intervalMs = 1500,
}: UseProvisioningSandboxOptions) {
  useEffect(() => {
    if (!active) return

    const interval = window.setInterval(async () => {
      try {
        const captured = await pollFn()
        if (captured) {
          window.clearInterval(interval)
          await onCapture(captured)
        }
      } catch (cause) {
        onError(cause instanceof Error ? cause : new Error(String(cause)))
      }
    }, intervalMs)

    return () => window.clearInterval(interval)
  }, [active, pollFn, onCapture, onError, intervalMs])
}
