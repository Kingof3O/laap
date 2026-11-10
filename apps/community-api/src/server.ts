import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { ModerationStore } from './moderation.ts'
import { approvedCatalogHandler, loadApprovedCatalog } from './catalog.ts'
import { createCommunityServer } from './party.ts'

const port = Number(process.env.LAAP_COMMUNITY_PORT ?? 4171)
const host = process.env.LAAP_COMMUNITY_HOST ?? '127.0.0.1'
const origins = new Set((process.env.LAAP_COMMUNITY_ORIGINS ??
  'http://localhost:1420,http://127.0.0.1:1420,http://tauri.localhost,tauri://localhost').split(','))
const databasePath = process.env.LAAP_COMMUNITY_DATABASE ?? '.data/community.sqlite'
await mkdir(dirname(databasePath), { recursive: true })
const moderation = new ModerationStore(databasePath)
const approvedDirectory = process.env.LAAP_APPROVED_CATALOG_DIR
const catalog = approvedDirectory
  ? approvedCatalogHandler(approvedDirectory, await loadApprovedCatalog(approvedDirectory), origins, (hash) => moderation.isBlocked(hash))
  : undefined
const { server, close } = createCommunityServer({ origins, catalog, moderation: moderation.handler(origins, process.env.LAAP_MODERATION_TOKEN) })
server.listen(port, host, () => {
  console.log(`LAAP community relay listening at ${host}:${port}`)
})
const shutdown = () => void close().finally(() => moderation.close())
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
