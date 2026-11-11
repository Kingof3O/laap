import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import type { CatalogHandler } from './catalog.ts'

const HASH = /^[a-f0-9]{64}$/
const ADMIN_KEY = process.env.COMMUNITY_ADMIN_KEY || 'community-admin-key-laap-2026'

async function readJsonBody(req: IncomingMessage, maxBytes = 256 * 1024): Promise<Record<string, unknown>> {
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

function extractBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) return null
  return auth.slice(7).trim()
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
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
        auth_token_hash TEXT NOT NULL,
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
        status TEXT NOT NULL, -- 'pending_review', 'approved', 'rejected', 'takedown'
        moderation_note TEXT,
        rights_confirmed INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        package_hash TEXT NOT NULL,
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
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
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key')
        res.writeHead(204).end()
        return true
      }

      // GET /v1/marketplace/mods
      if (req.method === 'GET' && (url === '/v1/marketplace/mods' || url.startsWith('/v1/marketplace/mods?'))) {
        try {
          const adminKey = req.headers['x-admin-key'] as string | undefined
          const isAdmin = adminKey === ADMIN_KEY
          const isPendingRequested = isAdmin && url.includes('status=pending_review')

          const filterStatus = isPendingRequested ? 'pending_review' : 'approved'

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
            WHERE s.status = ?
            GROUP BY s.id
            ORDER BY s.created_at DESC
            LIMIT 100
          `).all(filterStatus) as Array<Record<string, unknown>>

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
          const requestedId = typeof data.id === 'string' && data.id.trim() ? data.id.trim() : null
          const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : ''
          const bio = typeof data.bio === 'string' ? data.bio.trim() : ''
          const contact = typeof data.contact === 'string' ? data.contact.trim() : ''

          if (!displayName || displayName.length > 50) {
            res.writeHead(400).end(JSON.stringify({ error: 'Display name is required (max 50 chars).' }))
            return
          }

          if (requestedId) {
            // Update existing creator - require authorization
            const token = extractBearerToken(req)
            if (!token) {
              res.writeHead(401).end(JSON.stringify({ error: 'Authorization header required to update creator profile.' }))
              return
            }
            const existing = this.database.prepare('SELECT id, auth_token_hash FROM creator_profiles WHERE id = ?').get(requestedId) as { id: string; auth_token_hash: string } | undefined
            if (!existing || existing.auth_token_hash !== hashToken(token)) {
              res.writeHead(403).end(JSON.stringify({ error: 'Invalid creator credentials.' }))
              return
            }

            this.database.prepare(`
              UPDATE creator_profiles
              SET display_name = ?, bio = ?, contact = ?
              WHERE id = ?
            `).run(displayName, bio, contact, requestedId)

            res.writeHead(200).end(JSON.stringify({ id: requestedId, displayName, bio, contact, verified: false }))
            return
          }

          // Register new creator with fresh auth token
          const id = randomUUID()
          const authToken = randomBytes(32).toString('hex')
          const authTokenHash = hashToken(authToken)

          const stmt = this.database.prepare(`
            INSERT INTO creator_profiles (id, display_name, bio, contact, auth_token_hash, verified, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?)
          `)
          stmt.run(id, displayName, bio, contact, authTokenHash, Date.now())

          res.writeHead(200).end(JSON.stringify({ id, displayName, bio, contact, verified: false, authToken }))
        }).catch((e) => {
          if (!res.headersSent) res.writeHead(400).end(JSON.stringify({ error: (e as Error).message }))
        })
        return true
      }

      // POST /v1/marketplace/submit
      if (req.method === 'POST' && url === '/v1/marketplace/submit') {
        void readJsonBody(req).then((data) => {
          const token = extractBearerToken(req)
          if (!token) {
            res.writeHead(401).end(JSON.stringify({ error: 'Authorization bearer token required for mod submission.' }))
            return
          }

          const creatorId = typeof data.creatorId === 'string' ? data.creatorId.trim() : ''
          const packageHash = typeof data.packageHash === 'string' ? data.packageHash.trim().toLowerCase() : ''
          const title = typeof data.title === 'string' ? data.title.trim() : ''
          const description = typeof data.description === 'string' ? data.description.trim() : ''
          const champion = typeof data.champion === 'string' ? data.champion.trim() : ''
          const version = typeof data.version === 'string' ? data.version.trim() : '1.0.0'
          const tags = Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === 'string').slice(0, 10) : []
          const rightsConfirmed = Boolean(data.rightsConfirmed)
          const archiveBase64 = typeof data.archiveBase64 === 'string' ? data.archiveBase64.trim() : null

          if (!creatorId || !HASH.test(packageHash) || !title || !rightsConfirmed) {
            res.writeHead(400).end(JSON.stringify({
              error: 'Missing required submission fields (creatorId, packageHash, title, rightsConfirmed must be true).',
            }))
            return
          }

          // Authenticate creator
          const creator = this.database.prepare('SELECT id, auth_token_hash FROM creator_profiles WHERE id = ?').get(creatorId) as { id: string; auth_token_hash: string } | undefined
          if (!creator || creator.auth_token_hash !== hashToken(token)) {
            res.writeHead(403).end(JSON.stringify({ error: 'Creator authentication failed. Invalid token.' }))
            return
          }

          // Verify archive payload checksum if supplied
          if (archiveBase64) {
            const decoded = Buffer.from(archiveBase64, 'base64')
            const calculatedHash = createHash('sha256').update(decoded).digest('hex')
            if (calculatedHash !== packageHash) {
              res.writeHead(400).end(JSON.stringify({ error: 'Archive payload checksum does not match packageHash.' }))
              return
            }
            if (!decoded.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
              res.writeHead(400).end(JSON.stringify({ error: 'Archive payload is not a valid ZIP structure.' }))
              return
            }
          }

          const id = randomUUID()
          const now = Date.now()
          const stmt = this.database.prepare(`
            INSERT INTO submissions (id, creator_id, package_hash, title, description, champion, version, tags, status, moderation_note, rights_confirmed, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', NULL, 1, ?)
            ON CONFLICT(package_hash) DO UPDATE SET
              title=excluded.title,
              description=excluded.description,
              champion=excluded.champion,
              version=excluded.version,
              tags=excluded.tags,
              status='pending_review'
          `)
          stmt.run(id, creatorId, packageHash, title, description, champion, version, JSON.stringify(tags), now)

          res.writeHead(200).end(JSON.stringify({
            id,
            packageHash,
            status: 'pending_review',
            message: 'Submission queued for moderation review before being published.',
          }))
        }).catch((e) => {
          if (!res.headersSent) res.writeHead(400).end(JSON.stringify({ error: (e as Error).message }))
        })
        return true
      }

      // POST /v1/marketplace/admin/review/:hash (Moderation endpoint)
      const adminMatch = /^\/v1\/marketplace\/admin\/review\/([a-f0-9]{64})$/.exec(url)
      if (req.method === 'POST' && adminMatch) {
        const adminKey = req.headers['x-admin-key'] as string | undefined
        if (adminKey !== ADMIN_KEY) {
          res.writeHead(401).end(JSON.stringify({ error: 'Unauthorized: Admin key required for moderation.' }))
          return true
        }

        const hash = adminMatch[1]
        void readJsonBody(req).then((data) => {
          const action = typeof data.action === 'string' ? data.action.trim().toLowerCase() : ''
          const note = typeof data.note === 'string' ? data.note.trim() : null

          if (!['approve', 'reject', 'takedown'].includes(action)) {
            res.writeHead(400).end(JSON.stringify({ error: 'Action must be one of: approve, reject, takedown.' }))
            return
          }

          const newStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'takedown'
          const info = this.database.prepare(`
            UPDATE submissions
            SET status = ?, moderation_note = ?
            WHERE package_hash = ?
          `).run(newStatus, note, hash)

          if (info.changes === 0) {
            res.writeHead(404).end(JSON.stringify({ error: 'Submission not found.' }))
            return
          }

          res.writeHead(200).end(JSON.stringify({ packageHash: hash, status: newStatus }))
        }).catch((e) => {
          if (!res.headersSent) res.writeHead(400).end(JSON.stringify({ error: (e as Error).message }))
        })
        return true
      }

      // POST /v1/marketplace/review
      if (req.method === 'POST' && url === '/v1/marketplace/review') {
        void readJsonBody(req).then((data) => {
          const token = extractBearerToken(req)
          if (!token) {
            res.writeHead(401).end(JSON.stringify({ error: 'Authorization bearer token required to post a review.' }))
            return
          }

          // Identify reviewer
          const reviewer = this.database.prepare('SELECT id, display_name FROM creator_profiles WHERE auth_token_hash = ?').get(hashToken(token)) as { id: string; display_name: string } | undefined
          if (!reviewer) {
            res.writeHead(403).end(JSON.stringify({ error: 'Creator authentication required to post reviews.' }))
            return
          }

          const packageHash = typeof data.packageHash === 'string' ? data.packageHash.trim().toLowerCase() : ''
          const rating = typeof data.rating === 'number' && Number.isInteger(data.rating) ? data.rating : 0
          const comment = typeof data.comment === 'string' ? data.comment.trim() : ''

          if (!HASH.test(packageHash) || rating < 1 || rating > 5) {
            res.writeHead(400).end(JSON.stringify({
              error: 'Rating must be an integer between 1 and 5 and packageHash must be valid SHA-256.',
            }))
            return
          }

          // Check mod exists and is approved
          const submission = this.database.prepare('SELECT creator_id, status FROM submissions WHERE package_hash = ?').get(packageHash) as { creator_id: string; status: string } | undefined
          if (!submission || submission.status !== 'approved') {
            res.writeHead(400).end(JSON.stringify({ error: 'Cannot review an unapproved or nonexistent package.' }))
            return
          }

          // Author cannot review their own package
          if (submission.creator_id === reviewer.id) {
            res.writeHead(400).end(JSON.stringify({ error: 'Creators cannot review their own submissions.' }))
            return
          }

          // Prevent duplicate review
          const existing = this.database.prepare('SELECT id FROM reviews WHERE package_hash = ? AND author_id = ?').get(packageHash, reviewer.id)
          if (existing) {
            res.writeHead(400).end(JSON.stringify({ error: 'You have already reviewed this package.' }))
            return
          }

          const id = randomUUID()
          const now = Date.now()
          this.database.prepare(`
            INSERT INTO reviews (id, package_hash, author_id, author_name, rating, comment, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(id, packageHash, reviewer.id, reviewer.display_name, rating, comment.slice(0, 500), now)

          res.writeHead(200).end(JSON.stringify({ id, packageHash, rating, author: reviewer.display_name }))
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
          SELECT id, author_name AS author, rating, comment, created_at AS createdAt
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
