import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }), { status: 405, headers })
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return new Response(JSON.stringify({ error: 'UNAUTHENTICATED' }), { status: 401, headers })
    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || authData.user?.app_metadata?.role !== 'admin') return new Response(JSON.stringify({ error: 'ADMIN_REQUIRED' }), { status: 403, headers })
    const input = await request.json() as { accountId?: string; username?: string; password?: string }
    if (!input.accountId || !uuid.test(input.accountId) || !input.username?.trim() || !input.password) return new Response(JSON.stringify({ error: 'INVALID_CREDENTIAL' }), { status: 400, headers })
    const { error } = await supabase.rpc('upsert_account_vault_secret', { p_account_id: input.accountId, p_username: input.username.trim(), p_password: input.password })
    if (error) return new Response(JSON.stringify({ error: 'VAULT_WRITE_FAILED' }), { status: 503, headers })
    return new Response(JSON.stringify({ success: true }), { status: 200, headers })
  } catch {
    return new Response(JSON.stringify({ error: 'INVALID_REQUEST' }), { status: 400, headers })
  }
})
