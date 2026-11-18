import { useCallback, useEffect, useRef, useState } from 'react'
import { invokeTauri, isTauriAvailable } from '../../lib/api'
import { flavor } from '../../product/flavors'

export interface BillingStatus {
  available: boolean
  signedIn: boolean
  pro: boolean
  expiresAt?: number | null
  endedGrant?: string | null
}

export interface ProfileSlots {
  pro: boolean
  canAdd: boolean
  lockedCount: number
  choices: { id: string; name: string; region: string }[]
  chooseCount: number
}

export function useBilling() {
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const current = useRef<BillingStatus | null>(null)
  const apply = useCallback((next: BillingStatus | null) => {
    if (!next) return
    const previous = current.current
    current.current = next
    setStatus(next)
    if (previous?.pro !== next.pro || previous?.endedGrant !== next.endedGrant) {
      window.dispatchEvent(new Event('laap:billing-changed'))
    }
  }, [])
  useEffect(() => {
    if (flavor !== 'basic') return
    let closed = false
    let pending = false
    const load = async () => {
      if (pending || !isTauriAvailable()) return
      pending = true
      const startedWith = current.current
      try {
        const next = await invokeTauri<BillingStatus>('billing_status', { refresh: false })
        if (!closed && current.current === startedWith) apply(next)
      } catch { /* Keep the last native status during shutdown. */ }
      finally { pending = false }
    }
    void load()
    const timer = window.setInterval(() => void load(), 30_000)
    window.addEventListener('online', load)
    window.addEventListener('focus', load)
    return () => {
      closed = true
      window.clearInterval(timer)
      window.removeEventListener('online', load)
      window.removeEventListener('focus', load)
    }
  }, [apply])
  return { status, apply }
}
