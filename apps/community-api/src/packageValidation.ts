import { createHash } from 'node:crypto'
import { fromBuffer, type Entry, type ZipFile } from 'yauzl'

export const MAX_ARCHIVE = 12 * 1024 * 1024
export const hashBytes = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const HASH = /^[a-f0-9]{64}$/
const extensions = new Set('png jpg jpeg webp dds skn skl sco scb anm mapgeo bin wad client json txt ogg wav bnk wpk'.split(' '))
export interface PackageManifest {
  schemaVersion: number; modId: string; version: string; displayName: string; author: string; license: string
  rightToDistribute: boolean; containsPaidRiotContent: boolean; sha256: string; supportedGameBuilds: string[]
  championIds?: number[]; files: { relativePath: string; sha256: string; sizeBytes: number }[]
  attributionUrl?: string | null; notes?: string | null
}
const text = (v: unknown, n: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= n && !/[\u0000-\u001f\u007f]/u.test(v)
export function safePath(name: string): boolean {
  return name.length <= 240 && name.split('/').every(p => p.length > 0 && p.length <= 90 &&
    /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(p) && !p.endsWith('.') && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))
}

export function parseManifest(value: unknown): PackageManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Manifest required')
  const m = value as PackageManifest
  const keys = new Set('schemaVersion modId version displayName author license rightToDistribute containsPaidRiotContent sha256 supportedGameBuilds championIds files attributionUrl notes'.split(' '))
  if (Object.keys(m).some(k => !keys.has(k)) || m.schemaVersion !== 1 || !text(m.modId, 100) || !/^[a-zA-Z0-9._-]+$/.test(m.modId) ||
    !text(m.version, 40) || !text(m.displayName, 160) || !text(m.author, 120) || !text(m.license, 80) ||
    m.rightToDistribute !== true || m.containsPaidRiotContent !== false || !HASH.test(m.sha256) ||
    !Array.isArray(m.supportedGameBuilds) || m.supportedGameBuilds.length > 120 || !m.supportedGameBuilds.every(v => text(v, 50)) ||
    (m.championIds !== undefined && (!Array.isArray(m.championIds) || m.championIds.length > 500 || !m.championIds.every(v => Number.isSafeInteger(v) && v > 0))) ||
    !Array.isArray(m.files) || !m.files.length || m.files.length > 512 || !m.files.every(f => f && Object.keys(f).length === 3 &&
      typeof f.relativePath === 'string' && safePath(f.relativePath) && HASH.test(f.sha256) && Number.isSafeInteger(f.sizeBytes) && f.sizeBytes > 0 && f.sizeBytes <= 64 * 1024 * 1024) ||
    (m.notes != null && !text(m.notes, 2000)) || (m.attributionUrl != null && (!text(m.attributionUrl, 2048) || !m.attributionUrl.startsWith('https://')))) throw Error('Invalid manifest or redistribution rights')
  if (new Set(m.files.map(f => f.relativePath.toLowerCase())).size !== m.files.length) throw Error('Duplicate paths')
  return m
}

// All archive bytes are traversed and hashed. No extraction or user-supplied executable runs here.
export async function validatePackage(bytes: Buffer, value: unknown): Promise<PackageManifest> {
  const manifest = parseManifest(value)
  if (!bytes.length || bytes.length > MAX_ARCHIVE || !bytes.subarray(0, 4).equals(Buffer.from('504b0304', 'hex')) || hashBytes(bytes) !== manifest.sha256) throw Error('Archive checksum or size invalid')
  const zip = await new Promise<ZipFile>((resolve, reject) => fromBuffer(bytes, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (e, z) => e ? reject(e) : resolve(z)))
  if (zip.entryCount !== manifest.files.length) { zip.close(); throw Error('Archive entries do not match manifest') }
  const seen = new Set<string>(); let expanded = 0
  await new Promise<void>((resolve, reject) => {
    const fail = (e: unknown) => { zip.close(); reject(e) }
    zip.on('error', fail); zip.on('end', resolve)
    zip.on('entry', (entry: Entry) => {
      void (async () => {
        const name = entry.fileName
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000
        const declared = manifest.files.find(f => f.relativePath === name)
        const ext = name.split('.').pop()?.toLowerCase() ?? ''
        expanded += entry.uncompressedSize
        if (!safePath(name) || seen.has(name.toLowerCase()) || !extensions.has(ext) ||
          (mode !== 0 && mode !== 0o100000) || (entry.generalPurposeBitFlag & 1) || !declared ||
          declared.sizeBytes !== entry.uncompressedSize || expanded > 128 * 1024 * 1024 ||
          entry.uncompressedSize > entry.compressedSize * 100) throw Error('Unsafe archive entry')
        seen.add(name.toLowerCase())
        const stream = await new Promise<NodeJS.ReadableStream>((ok, no) => zip.openReadStream(entry, (e, s) => e ? no(e) : ok(s)))
        const hash = createHash('sha256'); let size = 0; let head = Buffer.alloc(0)
        for await (const value of stream) {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
          size += chunk.length
          if (size > declared.sizeBytes) throw Error('Entry expands beyond declared size')
          if (head.length < 16) head = Buffer.concat([head, chunk]).subarray(0, 16)
          hash.update(chunk)
        }
        if (size !== declared.sizeBytes || hash.digest('hex') !== declared.sha256) throw Error('Entry checksum mismatch')
        if (head.subarray(0, 2).toString() === 'MZ' || head.subarray(0, 4).toString('hex') === '7f454c46' || head.subarray(0, 2).toString() === '#!') throw Error('Executable payload rejected')
        if ((ext === 'png' && head.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') ||
          ((ext === 'jpg' || ext === 'jpeg') && head.subarray(0, 2).toString('hex') !== 'ffd8') ||
          (ext === 'webp' && (head.subarray(0, 4).toString() !== 'RIFF' || head.subarray(8, 12).toString() !== 'WEBP'))) throw Error('Invalid image signature')
        zip.readEntry()
      })().catch(fail)
    })
    zip.readEntry()
  })
  return manifest
}
