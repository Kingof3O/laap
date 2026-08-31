import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

type LaunchRequest = { sessionId: string; deviceId: string; accountId: string; nonce: string; signature: string }

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })

function decodeBase64(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
  return bytes
}

async function verifyChallenge(publicKey: string, nonce: string, signature: string) {
  const key = await crypto.subtle.importKey('raw', decodeBase64(publicKey), { name: 'Ed25519' }, false, ['verify'])
  return crypto.subtle.verify('Ed25519', key, decodeBase64(signature), new TextEncoder().encode(nonce))
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }), { status: 405, headers: jsonHeaders })
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return new Response(JSON.stringify({ error: 'UNAUTHENTICATED' }), { status: 401, headers: jsonHeaders })
    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return new Response(JSON.stringify({ error: 'UNAUTHENTICATED' }), { status: 401, headers: jsonHeaders })
    const input = await request.json() as LaunchRequest
    const [timestampText, nonceAccountId] = input.nonce.split(':', 2)
    const timestamp = Number(timestampText)
    if (!input.sessionId || !input.deviceId || !input.accountId || !input.signature || nonceAccountId !== input.accountId || !Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 300_000) return new Response(JSON.stringify({ error: 'INVALID_CHALLENGE' }), { status: 400, headers: jsonHeaders })
    const { data: device } = await supabase.from('user_devices').select('id, user_id, public_key, status').eq('id', input.deviceId).eq('user_id', authData.user.id).eq('status', 'active').maybeSingle()
    if (!device || !(await verifyChallenge(device.public_key, input.nonce, input.signature))) return new Response(JSON.stringify({ error: 'INVALID_DEVICE_SIGNATURE' }), { status: 401, headers: jsonHeaders })
    const { data: session } = await supabase.from('account_sessions').select('id, account_id, user_id, device_id, status').eq('id', input.sessionId).eq('account_id', input.accountId).eq('user_id', authData.user.id).eq('device_id', input.deviceId).in('status', ['starting', 'active']).maybeSingle()
    if (!session) return new Response(JSON.stringify({ error: 'SESSION_NOT_FOUND' }), { status: 404, headers: jsonHeaders })

    // The Vault read is intentionally kept behind a private RPC. The RPC must
    // return a one-time, device-sealed payload; never expose `vault.decrypted_secrets`
    // through the public REST schema or return raw credentials to a browser.
    const { data: sealed, error: vaultError } = await supabase.rpc('issue_device_launch_payload', { p_session_id: session.id, p_device_id: device.id, p_nonce: input.nonce })
    if (vaultError || !sealed) return new Response(JSON.stringify({ error: 'LAUNCH_PAYLOAD_UNAVAILABLE' }), { status: 503, headers: jsonHeaders })
    return new Response(JSON.stringify({ sessionId: session.id, expiresAt: new Date(Date.now() + 30_000).toISOString(), payload: sealed }), { status: 200, headers: jsonHeaders })
  } catch {
    return new Response(JSON.stringify({ error: 'INVALID_REQUEST' }), { status: 400, headers: jsonHeaders })
  }
})
