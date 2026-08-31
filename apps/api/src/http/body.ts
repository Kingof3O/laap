import type { IncomingMessage } from 'node:http'
import { HttpError } from './errors.js'

const MAX_BODY_BYTES = 1024 * 1024

export async function readJson<T>(request: IncomingMessage): Promise<T> {
  const declaredLength = Number(request.headers['content-length'] ?? 0)
  if (declaredLength > MAX_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE')
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.byteLength
    if (total > MAX_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE')
    chunks.push(buffer)
  }
  if (!chunks.length) return {} as T
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON')
  }
}
