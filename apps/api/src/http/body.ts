import type { IncomingMessage } from 'node:http'
import { HttpError } from './errors.js'

const MAX_BODY_BYTES = 1024 * 1024

export async function readRawBodyBytes(
  request: IncomingMessage,
  maxBytes = MAX_BODY_BYTES,
): Promise<Uint8Array> {
  const declaredLength = Number(request.headers['content-length'] ?? 0)
  if (declaredLength > maxBytes) throw new HttpError(413, 'PAYLOAD_TOO_LARGE')
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.byteLength
    if (total > maxBytes) throw new HttpError(413, 'PAYLOAD_TOO_LARGE')
    chunks.push(buffer)
  }
  return chunks.length ? new Uint8Array(Buffer.concat(chunks)) : new Uint8Array(0)
}

export async function readJson<T>(request: IncomingMessage): Promise<T> {
  const bytes = await readRawBodyBytes(request, MAX_BODY_BYTES)
  if (!bytes.byteLength) return {} as T
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as T
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON')
  }
}
