import { createHash } from 'node:crypto'
import { open, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

const MAX_ARCHIVE = 12 * 1024 * 1024
const MAX_MANIFEST = 256 * 1024
const HASH = /^[0-9a-f]{64}$/
const MANIFEST_KEYS = new Set([
  'schemaVersion', 'modId', 'version', 'displayName', 'author', 'license', 'rightToDistribute',
  'containsPaidRiotContent', 'sha256', 'supportedGameBuilds', 'championIds', 'files', 'attributionUrl', 'notes',
])
function validFile(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return Object.keys(row).length === 3 && safeText(row.relativePath, 240) &&
    typeof row.sha256 === 'string' && HASH.test(row.sha256) &&
    typeof row.sizeBytes === 'number' && Number.isSafeInteger(row.sizeBytes) && row.sizeBytes > 0
}

interface ApprovedEntry {
  hash: string
  manifest: Record<string, unknown>
  bytes: number
}

async function regularFile(path: string, max: number): Promise<Buffer> {
  const file = await open(path, 'r')
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size === 0 || stat.size > max) throw new Error('Invalid approved catalog file size')
    const buffer = Buffer.alloc(stat.size + 1)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset)
      if (!bytesRead) break
      offset += bytesRead
    }
    if (offset !== stat.size) throw new Error('Approved catalog file changed during read')
    return buffer.subarray(0, offset)
  } finally {
    await file.close()
  }
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const safeText = (value: unknown, max: number) => typeof value === 'string' && value.length > 0 && value.length <= max
  && !/[\u0000-\u001f\u007f]/u.test(value)

export async function loadApprovedCatalog(directory: string): Promise<Map<string, ApprovedEntry>> {
  const index = new Map<string, ApprovedEntry>()
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name))
  if (files.length > 100) throw new Error('Approved catalog exceeds its entry limit')
  for (const file of files) {
    const hash = file.name.slice(0, -5)
    if (!HASH.test(hash)) throw new Error('Approved manifests must use the archive digest as a filename')
    const body: unknown = JSON.parse((await regularFile(join(directory, file.name), MAX_MANIFEST)).toString('utf8'))
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('Invalid approved manifest')
    const row = body as Record<string, unknown>
    if (Object.keys(row).some((key) => !MANIFEST_KEYS.has(key)) || row.schemaVersion !== 1 || row.sha256 !== hash || row.rightToDistribute !== true
      || row.containsPaidRiotContent !== false || !safeText(row.displayName, 160) || !safeText(row.version, 40)
      || !safeText(row.author, 120) || !safeText(row.license, 80)
      || !Array.isArray(row.files) || row.files.length === 0 || row.files.length > 256 || !row.files.every(validFile) ||
      !safeText(row.modId, 100) || !Array.isArray(row.supportedGameBuilds) ||
      row.supportedGameBuilds.length > 120 || !row.supportedGameBuilds.every((value) => safeText(value, 50)) ||
      (row.championIds !== undefined && (!Array.isArray(row.championIds) || row.championIds.length > 500 ||
        !row.championIds.every((value) => Number.isSafeInteger(value) && value > 0))) ||
      (row.notes != null && !safeText(row.notes, 2000)) ||
      (row.attributionUrl != null && (typeof row.attributionUrl !== 'string' || !row.attributionUrl.startsWith('https://')))) {
      throw new Error('Approved manifest is missing required rights or archive metadata')
    }
    const archive = await regularFile(join(directory, hash + '.zip'), MAX_ARCHIVE)
    if (sha256(archive) !== hash || archive.subarray(0, 4).toString('hex') !== '504b0304') {
      throw new Error('Approved archive does not match its manifest')
    }
    index.set(hash, { hash, manifest: row, bytes: archive.length })
  }
  return index
}

export type CatalogHandler = (req: IncomingMessage, res: ServerResponse) => boolean

export function approvedCatalogHandler(
  directory: string, index: Map<string, ApprovedEntry>, origins: ReadonlySet<string>, isBlocked: (hash: string) => boolean = () => false,
): CatalogHandler {
  let downloads = 0
  return (req, res) => {
    if (req.method !== 'GET' || !req.url?.startsWith('/v1/catalog/')) return false
    if (req.headers.origin && !origins.has(req.headers.origin)) {
      res.writeHead(403).end()
      return true
    }
    if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (req.url === '/v1/catalog/mods') {
      res.end(JSON.stringify([...index.values()].filter((entry) => !isBlocked(entry.hash)).map(({ hash, bytes, manifest }) => ({
        hash, bytes, displayName: manifest.displayName, version: manifest.version, author: manifest.author, license: manifest.license,
      }))))
      return true
    }
    const match = /^\/v1\/catalog\/mods\/([a-f0-9]{64})(?:\/(download))?$/.exec(req.url)
    const entry = match ? index.get(match[1]!) : undefined
    if (!entry || isBlocked(entry.hash)) {
      res.writeHead(404).end()
    } else if (match?.[2] !== 'download') {
      res.end(JSON.stringify(entry.manifest))
    } else if (downloads >= 4) {
      res.writeHead(429, { 'Retry-After': '3' }).end()
    } else {
      downloads++
      void regularFile(join(directory, entry.hash + '.zip'), MAX_ARCHIVE).then((archive) => {
        if (isBlocked(entry.hash)) throw new Error('Package was removed')
        if (sha256(archive) !== entry.hash) throw new Error('Approved archive changed')
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': archive.length,
          'Content-Disposition': 'attachment; filename="' + entry.hash + '.zip"' }).end(archive)
      }).catch(() => {
        if (!res.headersSent) res.writeHead(503).end()
      }).finally(() => { downloads-- })
    }
    return true
  }
}
