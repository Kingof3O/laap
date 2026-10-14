import { useEffect, useRef, useState } from 'react'
interface Options {
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
}: Options) {
  const callbacks = useRef({ pollFn, onCapture, onError })
  callbacks.current = { pollFn, onCapture, onError }
  const [capturing, setCapturing] = useState(false)
  useEffect(() => {
    if (!active) {
      setCapturing(false)
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const session = await callbacks.current.pollFn()
        if (cancelled) return
        if (session) {
          setCapturing(true)
          try {
            await callbacks.current.onCapture(session)
          } finally {
            if (!cancelled) setCapturing(false)
          }
          return
        }
      } catch (cause) {
        if (!cancelled)
          callbacks.current.onError?.(
            cause instanceof Error ? cause : new Error(String(cause)),
          )
        return
      }
      if (!cancelled) timer = setTimeout(() => void poll(), pollIntervalMs)
    }
    timer = setTimeout(() => void poll(), pollIntervalMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [active, pollIntervalMs])
  return { capturing }
}
