import path from 'node:path'

const isProduction = process.env.NODE_ENV === 'production'
const isCloudflareWorker = process.env.CF_WORKER === '1'

function requiredSecret(name: string, fallback: string) {
  const value = process.env[name] ?? fallback
  if (isProduction && !isCloudflareWorker && (!process.env[name] || value.length < 32)) {
    throw new Error(`${name} must be configured with at least 32 characters in production`)
  }
  return value
}

export const config = {
  port: Number(process.env.LAAP_API_PORT ?? 4170),
  dataDir: path.resolve(process.env.LAAP_DATA_DIR ?? path.join(process.cwd(), '.data')),
  jwtSecret: requiredSecret('LAAP_JWT_SECRET', 'laap-local-development-secret-change-me-32'),
  vaultKey: requiredSecret('LAAP_VAULT_KEY', 'laap-local-vault-key-change-me-32'),
  adminPassword: process.env.LAAP_ADMIN_PASSWORD ?? 'ChangeMe!2026',
  enableDemoAuth: !isProduction && process.env.ENABLE_DEMO_AUTH !== 'false',
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173,http://localhost:1420,tauri://localhost',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  logRequests: process.env.LOG_REQUESTS !== 'false',
  storageDriver: process.env.LAAP_STORAGE_DRIVER ?? 'local',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
}

if (isProduction && !isCloudflareWorker && (config.adminPassword === 'ChangeMe!2026' || config.adminPassword.length < 12)) {
  throw new Error('LAAP_ADMIN_PASSWORD must be changed to a 12+ character value in production')
}

if (isProduction && !isCloudflareWorker && config.storageDriver === 'local' && process.env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION !== 'true') {
  throw new Error('Refusing to start production with the single-process local storage adapter; deploy the Supabase/Postgres adapter or explicitly set ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true')
}
