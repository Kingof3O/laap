import { useEffect, useRef } from 'react'

interface UseProvisioningSandboxOptions {
  active: boolean
  pollFn: () => Promise<string | null>
  onCapture: (sessionBlob: string) => Promise<void> | void
  onError?: (err: Error) => void
  pollIntervalMs?: number
}

export function useProvisioningSandbox({
  active,
  pollFn,
  onCapture,
  onError,
  pollIntervalMs = 1500,
}: UseProvisioningSandboxOptions) {
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!active) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
      return
    }

    pollTimerRef.current = setInterval(async () => {
      try {
        const captured = await pollFn()
        if (captured) {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current)
            pollTimerRef.current = null
          }
          await onCapture(captured)
        }
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)))
      }
    }, pollIntervalMs)

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [active, pollFn, onCapture, onError, pollIntervalMs])
}
