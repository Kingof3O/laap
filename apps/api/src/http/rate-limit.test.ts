import { describe, expect, it, vi } from 'vitest'
import { FixedWindowRateLimiter } from './rate-limit.js'

describe('FixedWindowRateLimiter', () => {
  it('blocks after the configured attempts and resets a successful client', () => {
    const limiter = new FixedWindowRateLimiter(2, 30_000)
    expect(limiter.allow('ip').allowed).toBe(true)
    expect(limiter.allow('ip').allowed).toBe(true)
    expect(limiter.allow('ip').allowed).toBe(false)
    limiter.reset('ip')
    expect(limiter.allow('ip').allowed).toBe(true)
  })

  it('expires a window without leaking entries forever', () => {
    vi.useFakeTimers()
    try {
      const limiter = new FixedWindowRateLimiter(1, 1_000)
      expect(limiter.allow('ip').allowed).toBe(true)
      vi.advanceTimersByTime(1_001)
      limiter.sweep()
      expect(limiter.allow('ip').allowed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
