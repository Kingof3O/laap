type Entry = { count: number; resetAt: number }

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  allow(key: string) {
    const now = Date.now()
    const current = this.entries.get(key)
    if (!current || current.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs })
      return { allowed: true, retryAfterSeconds: 0 }
    }
    if (current.count >= this.limit) return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) }
    current.count += 1
    return { allowed: true, retryAfterSeconds: 0 }
  }

  reset(key: string) { this.entries.delete(key) }
  sweep() { const now = Date.now(); for (const [key, entry] of this.entries) if (entry.resetAt <= now) this.entries.delete(key) }
}
