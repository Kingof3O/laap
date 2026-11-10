import { randomUUID, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import type { CatalogHandler } from './catalog.ts'

const HASH = /^[a-f0-9]{64}$/
const REASONS = ['copyright', 'malware', 'broken', 'other'] as const

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += data.length
    if (size > 4096) throw new Error('Request is too large')
    chunks.push(data)
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid request')
  return value as Record<string, unknown>
}

export class ModerationStore {
  private database: DatabaseSync
  private attempts = new Map<string, { start: number; count: number }>()
  private blocked = new Set<string>()

  constructor(path: string) {
    this.database = new DatabaseSync(path)
    this.database.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY, package_hash TEXT NOT NULL, reason TEXT NOT NULL,
        notes TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS blocked_packages (
        package_hash TEXT PRIMARY KEY, reason TEXT NOT NULL, blocked_at INTEGER NOT NULL
      );
    `)
    const rows = this.database.prepare('SELECT package_hash FROM blocked_packages').all() as Array<{ package_hash: string }>
    this.blocked = new Set(rows.map((row) => row.package_hash))
  }

  isBlocked(hash: string) { return this.blocked.has(hash) }

  private allow(ip: string) {
    const now = Date.now()
    for (const [key, value] of this.attempts) {
      if (now - value.start > 3600_000) this.attempts.delete(key)
    }
    const existing = this.attempts.get(ip)
    if (existing) {
      existing.count += 1
      return existing.count <= 5
    }
    if (this.attempts.size >= 10_000) return false
    this.attempts.set(ip, { start: now, count: 1 })
    return true
  }

  handler(origins: ReadonlySet<string>, adminToken: string | undefined): CatalogHandler {
    return (req, res) => {
      const report = /^\/v1\/catalog\/mods\/([a-f0-9]{64})\/report$/.exec(req.url ?? '')
      const admin = req.url === '/v1/moderation/reports' || req.url === '/v1/moderation/block'
      if (!report && !admin) return false
      if (req.headers.origin && !origins.has(req.headers.origin)) {
        res.writeHead(403).end()
        return true
      }
      if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
      res.setHeader('Vary', 'Origin')
      if (req.method === 'OPTIONS' && report) {
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        res.writeHead(204).end()
        return true
      }
      if (admin) {
        const received = req.headers.authorization?.replace(/^Bearer /, '') ?? ''
        const receivedBytes = Buffer.from(received)
        const expectedBytes = Buffer.from(adminToken ?? '')
        const allowed = !!adminToken && adminToken.length >= 32 && receivedBytes.length === expectedBytes.length &&
          timingSafeEqual(receivedBytes, expectedBytes)
        if (!allowed) { res.writeHead(401).end(); return true }
        if (req.method === 'GET' && req.url === '/v1/moderation/reports') {
          const rows = this.database.prepare('SELECT id, package_hash AS packageHash, reason, notes, created_at AS createdAt FROM reports ORDER BY created_at DESC LIMIT 200').all()
          res.end(JSON.stringify(rows))
          return true
        }
        if (req.method === 'POST' && req.url === '/v1/moderation/block') {
          void body(req).then((value) => {
            if (Object.keys(value).length !== 2 || typeof value.hash !== 'string' || !HASH.test(value.hash) ||
              typeof value.reason !== 'string' || value.reason.length < 1 || value.reason.length > 240) throw new Error('Invalid block request')
            this.database.prepare('INSERT INTO blocked_packages VALUES (?, ?, ?) ON CONFLICT(package_hash) DO UPDATE SET reason=excluded.reason, blocked_at=excluded.blocked_at')
              .run(value.hash, value.reason, Date.now())
            this.blocked.add(value.hash)
            res.end('{"blocked":true}')
          }).catch(() => { if (!res.headersSent) res.writeHead(400).end('{"error":"Invalid moderation request"}') })
          return true
        }
        res.writeHead(405).end()
        return true
      }
      if (req.method !== 'POST') { res.writeHead(405).end(); return true }
      if (!this.allow(req.socket.remoteAddress ?? '')) { res.writeHead(429).end(); return true }
      const count = this.database.prepare('SELECT COUNT(*) AS count FROM reports').get() as { count: number }
      if (count.count >= 100_000) { res.writeHead(503).end(); return true }
      void body(req).then((value) => {
        if (Object.keys(value).length !== 2 || !REASONS.includes(value.reason as typeof REASONS[number]) ||
          typeof value.notes !== 'string' || value.notes.length > 1000 || /[\u0000-\u001f]/u.test(value.notes)) {
          throw new Error('Invalid report')
        }
        const id = randomUUID()
        this.database.prepare('INSERT INTO reports VALUES (?, ?, ?, ?, ?)').run(id, report![1]!, String(value.reason), value.notes, Date.now())
        res.writeHead(201).end(JSON.stringify({ reportId: id }))
      }).catch(() => { if (!res.headersSent) res.writeHead(400).end('{"error":"Invalid report"}') })
      return true
    }
  }

  close() { this.database.close() }
}
