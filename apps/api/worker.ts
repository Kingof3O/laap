/**
 * Cloudflare Worker entrypoint for the production Supabase-backed API.
 *
 * The existing Node HTTP server is intentionally reused through Cloudflare's
 * Node HTTP compatibility bridge. This keeps the local and hosted route
 * boundary identical while Supabase remains the durable source of truth.
 */
import { httpServerHandler } from 'cloudflare:node'
import { createSupabaseApp } from './src/server.js'

const app = await createSupabaseApp({
  nodeEnv: 'production',
  storageDriver: 'supabase',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.LAAP_WORKER_SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.LAAP_WORKER_SUPABASE_SERVICE_ROLE_KEY ?? '',
  jwtSecret: process.env.LAAP_WORKER_JWT_SECRET ?? '',
  vaultKey: process.env.LAAP_WORKER_VAULT_KEY ?? '',
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? 'https://laap-control-center.pages.dev',
  enableDemoAuth: false,
  logRequests: false,
  reaperEnabled: false,
})

export default httpServerHandler(app.server)
