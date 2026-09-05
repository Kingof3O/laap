import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const PREFIX = 'laap:v1'

function deriveKey(secret: string) {
  if (secret.length < 32) throw new Error('LAAP vault key must contain at least 32 characters')
  return createHash('sha256').update(secret, 'utf8').digest()
}

export function encryptSecret(value: string, secret: string, context: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv)
  cipher.setAAD(Buffer.from(context, 'utf8'))
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':')
}

export function decryptSecret(value: string, secret: string, context: string) {
  if (!value.startsWith(`${PREFIX}:`)) return { value, legacyPlaintext: true }
  const parts = value.split(':')
  if (parts.length !== 5 || parts[0] !== 'laap' || parts[1] !== 'v1') throw new Error('Stored secret envelope is invalid')
  const iv = Buffer.from(parts[2], 'base64url')
  const tag = Buffer.from(parts[3], 'base64url')
  const encrypted = Buffer.from(parts[4], 'base64url')
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Stored secret envelope is invalid')
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), iv)
  decipher.setAAD(Buffer.from(context, 'utf8'))
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  return { value: decrypted, legacyPlaintext: false }
}

export function isEncryptedSecret(value: string | null | undefined) {
  return Boolean(value?.startsWith(`${PREFIX}:`))
}
