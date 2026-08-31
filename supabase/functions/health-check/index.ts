const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

Deno.serve(() => new Response(JSON.stringify({ status: 'ok', service: 'laap-supabase', timestamp: new Date().toISOString() }), { status: 200, headers }))
