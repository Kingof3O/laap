import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import type { CatalogHandler } from './catalog.ts'

const HASH = /^[a-f0-9]{64}$/

async function readJsonBody(req: IncomingMessage, maxBytes = 64 * 1024): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += data.length
    if (size > maxBytes) throw new Error('Request payload too large')
    chunks.push(data)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  const val = JSON.parse(text)
  if (!val || typeof val !== 'object' || Array.isArray(val)) {
    throw new Error('Invalid JSON payload')
  }
  return val as Record<string, unknown>
}

export class MarketplaceStore {
  public database: DatabaseSync

  constructor(databaseOrPath: string | DatabaseSync) {
    if (typeof databaseOrPath === 'string') {
      this.database = new DatabaseSync(databaseOrPath)
    } else {
      this.database = databaseOrPath
    }
    this.initSchema()
  }

  private initSchema() {
    this.database.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS creator_profiles (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        bio TEXT NOT NULL,
        contact TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        creator_id TEXT NOT NULL,
        package_hash TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        champion TEXT NOT NULL,
        version TEXT NOT NULL,
        tags TEXT NOT NULL,
        status TEXT NOT NULL,
        rights_confirmed INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        package_hash TEXT NOT NULL,
        author TEXT NOT NULL,
        rating INTEGER NOT NULL,
        comment TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS download_stats (
        package_hash TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        last_download INTEGER NOT NULL
      );
    `)
  }

  close() {
    this.database.close()
  }

  handler(origins: ReadonlySet<string>): CatalogHandler {
    return (req: IncomingMessage, res: ServerResponse): boolean => {
      const url = req.url ?? ''
      const isMarketplace = url.startsWith('/v1/marketplace/')
      if (!isMarketplace) return false

      if (req.headers.origin && !origins.has(req.headers.origin)) {
        res.writeHead(403).end()
        return true
      }
      if (req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
      }
      res.setHeader('Vary', 'Origin')
      res.setHeader('Content-Type', 'application/json')

      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        res.writeHead(204).end()
        return true
      }

      // GET /v1/marketplace/mods
      if (req.method === 'GET' && (url === '/v1/marketplace/mods' || url.startsWith('/v1/marketplace/mods?'))) {
        try {
          const rows = this.database.prepare(`
            SELECT
              s.id, s.creator_id AS creatorId, s.package_hash AS packageHash,
              s.title, s.description, s.champion, s.version, s.tags,
              s.status, s.created_at AS createdAt,
              COALESCE(c.display_name, 'Anonymous Creator') AS creatorName,
              COALESCE(d.count, 0) AS downloadCount,
              COALESCE(AVG(r.rating), 0.0) AS averageRating,
              COUNT(r.id) AS reviewCount
            FROM submissions s
            LEFT JOIN creator_profiles c ON s.creator_id = c.id
            LEFT JOIN download_stats d ON s.package_hash = d.package_hash
            LEFT JOIN reviews r ON s.package_hash = r.package_hash
            WHERE s.status = 'approved'
            GROUP BY s.id
            ORDER BY s.created_at DESC
            LIMIT 100
          `).all() as Array<Record<string, unknown>>

          const mods = rows.map((r) => ({
            ...r,
            tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : [],
            averageRating: Math.round(Number(r.averageRating) * 10) / 10,
            downloadCount: Number(r.downloadCount),
            reviewCount: Number(r.reviewCount),
          }))

          res.writeHead(200).end(JSON.stringify(mods))
        } catch (e) {
          res.writeHead(500).end(JSON.stringify({ error: (e as Error).message }))
        }
        return true
      }

      // POST /v1/marketplace/creator
      if (req.method === 'POST' && url === '/v1/marketplace/creator') {
        void readJsonBody(req).then((data) => {
          const id = typeof data.id === 'string' && data.id.trim() ? data.id.trim() : randomUUID()
          const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : ''
          const bio = typeof data.bio === 'string' ? data.bio.trim() : ''
          const contact = typeof data.contact === 'string' ? data.contact.trim() : ''

          if (!displayName || displayName.length > 50) {
            res.writeHead(400).end(JSON.stringify({ error: 'Display name is required (max 50 chars).' }))
            return
          }

          const stmt = this.database.prepare(`
            INSERT INTO creator_profiles (id, display_name, bio, contact, verified, created_at)
            VALUES (?, ?, ?, ?, 0, ?)
            ON CONFLICT(id) DO UPDATE SET
              display_name=excluded.display_name,
              bio=excluded.bio,
              contact=excluded.contact
          `)
          stmt.run(id, displayName, bio, contact, Date.now())

          res.writeHead(200).end(JSON.stringify({ id, displayName, bio, contact, verified: false }))
        }).catch((e) => {
          if (!res.headersSent) res.writeHead(400).end(JSON.stringify({ error: (e as Error).message }))
        })
        return true
      }

      // POST /v1/marketplace/submit
      if (req.method === 'POST' && url === '/v1/marketplace/submit') {
        void readJsonBody(req).then((data) => {
          const creatorId = typeof data.creatorId === 'string' ? data.creatorId.trim() : ''
          const packageHash = typeof data.packageHash === 'string' ? data.packageHash.trim().toLowerCase() : ''
          const title = typeof data.title === 'string' ? data.title.trim() : ''
          const description = typeof data.description === 'string' ? data.description.trim() : ''
          const champion = typeof data.champion === 'string' ? data.champion.trim() : ''
          const version = typeof data.version === 'string' ? data.version.trim() : '1.0.0'
          const tags = Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === 'string').slice(0, 10) : []
          const rightsConfirmed = Boolean(data.rightsConfirmed)

          if (!creatorId || !HASH.test(packageHash) || !title || !rightsConfirmed) {
            res.writeHead(400).end(JSON.stringify({
              error: 'Missing required submission fields (creatorId, packageHash, title, rightsConfirmed must be true).',
            }))
            return
          }

          const id = randomUUID()
          const now = Date.now()
          const stmt = this.database.prepare(`
            INSERT INTO submissions (id, creator_id, package_hash, title, description, champion, version, tags, status, rights_confirmed, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', 1, ?)
            ON CONFLICT(package_hash) DO UPDATE SET
              title=excluded.title,
              description=excluded.description,
              champion=excluded.champion,
              version=excluded.version,
              tags=excluded.tags
          `)
          stmt.run(id, creatorId, packageHash, title, description, champion, version, JSON.stringify(tags), now)

          res.writeHead(200).end(JSON.stringify({ id, packageHash, status: 'approved' }))
        }).catch((e) => {
          if (!res.headersSent) res.writeHead(400).end(JSON.stringify({ error: (e as Error).message }))
        })
        return true
      }

      // POST /v1/marketplace/review
      if (req.method === 'POST' && url === '/v1/marketplace/review') {
        void readJsonBody(req).then((data) => {
          const packageHash = typeof data.packageHash === 'string' ? data.packageHash.trim().toLowerCase() : ''
          const author = typeof data.author === 'string' ? data.author.trim() : 'Anonymous'
          const rating = typeof data.rating === 'number' && Number.isInteger(data.rating) ? data.rating : 0
          const comment = typeof data.comment === 'string' ? data.comment.trim() : ''

          if (!HASH.test(packageHash) || rating < 1 || rating > 5) {
            res.writeHead(400).end(JSON.stringify({
              error: 'Rating must be an integer between 1 and 5 and packageHash must be valid SHA-256.',
            }))
            return
          }

          const id = randomUUID()
          const now = Date.now()
          this.database.prepare(`
            INSERT INTO reviews (id, package_hash, author, rating, comment, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(id, packageHash, author, rating, comment.slice(0, 500), now)

          res.writeHead(200).end(JSON.stringify({ id, packageHash, rating, author }))
        }).catch((e) => {
          if (!res.headersSent) res.writeHead(400).end(JSON.stringify({ error: (e as Error).message }))
        })
        return true
      }

      // POST /v1/marketplace/download/:hash
      const downloadMatch = /^\/v1\/marketplace\/download\/([a-f0-9]{64})$/.exec(url)
      if (req.method === 'POST' && downloadMatch) {
        const hash = downloadMatch[1]
        const now = Date.now()
        this.database.prepare(`
          INSERT INTO download_stats (package_hash, count, last_download)
          VALUES (?, 1, ?)
          ON CONFLICT(package_hash) DO UPDATE SET
            count = count + 1,
            last_download = excluded.last_download
        `).run(hash, now)

        const row = this.database.prepare('SELECT count FROM download_stats WHERE package_hash = ?').get(hash) as { count: number }
        res.writeHead(200).end(JSON.stringify({ packageHash: hash, count: row.count }))
        return true
      }

      // GET /v1/marketplace/reviews/:hash
      const reviewsMatch = /^\/v1\/marketplace\/reviews\/([a-f0-9]{64})$/.exec(url)
      if (req.method === 'GET' && reviewsMatch) {
        const hash = reviewsMatch[1]
        const rows = this.database.prepare(`
          SELECT id, author, rating, comment, created_at AS createdAt
          FROM reviews
          WHERE package_hash = ?
          ORDER BY created_at DESC
          LIMIT 50
        `).all(hash)
        res.writeHead(200).end(JSON.stringify(rows))
        return true
      }

      return false
    }
  }
}
