const utf8 = new TextEncoder()

export const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

export function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url')
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (byte) => byte.charCodeAt(0))
}

export async function hash(value: string) {
  return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(value))))
}

export function randomCode(bytes: number) {
  return encode(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function verifyDevice(key: string, proof: string, action: string, challenge: string) {
  try {
    const publicKey = await crypto.subtle.importKey('raw', decode(key), 'Ed25519', false, ['verify'])
    return await crypto.subtle.verify('Ed25519', publicKey, decode(proof), utf8.encode('laap-device-v1:' + action + ':' + challenge))
  } catch {
    return false
  }
}

export async function signLease(privateKey: string, deviceKey: string, grant: { grantId?: string; end?: number | null }, iat: number) {
  const key = await crypto.subtle.importKey('pkcs8', decode(privateKey), 'Ed25519', false, ['sign'])
  const pro = Boolean(grant.grantId && (grant.end == null || grant.end > iat))
  const exp = pro ? Math.min(iat + 30 * 86_400, grant.end ?? Infinity) : iat + 86_400
  const payload = utf8.encode(JSON.stringify({
    v: 1, aud: 'com.laap.offline', deviceKey, state: pro ? 'pro' : 'basic',
    iat, exp, end: pro ? grant.end ?? null : null, grantId: pro ? grant.grantId : null,
  }))
  const signature = await crypto.subtle.sign('Ed25519', key, payload)
  return encode(payload) + '.' + encode(new Uint8Array(signature))
}

export async function verifyPaddle(raw: Uint8Array<ArrayBuffer>, header: string | null, secret: string, now: number) {
  const fields = header?.split(';') ?? []
  const timestamp = fields.find((field) => /^ts=\d{1,12}$/.test(field))?.slice(3)
  if (!timestamp || Math.abs(now - Number(timestamp)) > 5 || !secret) return false
  const signatures = fields.filter((field) => /^h1=[a-f0-9]{64}$/i.test(field)).map((field) => field.slice(3))
  const prefix = utf8.encode(timestamp + ':')
  const message = new Uint8Array(prefix.length + raw.length)
  message.set(prefix)
  message.set(raw, prefix.length)
  const key = await crypto.subtle.importKey('raw', utf8.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  for (const signature of signatures) {
    const bytes = Uint8Array.from(signature.match(/../g) ?? [], (part) => Number.parseInt(part, 16))
    if (await crypto.subtle.verify('HMAC', key, bytes, message)) return true
  }
  return false
}
