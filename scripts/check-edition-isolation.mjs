import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktop = fileURLToPath(new URL('../apps/desktop/', import.meta.url))
const require = createRequire(import.meta.url)
const vite = join(dirname(require.resolve('vite/package.json', { paths: [desktop] })), 'bin/vite.js')
const scratch = mkdtempSync(join(tmpdir(), 'laap-sku-check-'))
const editions = {
  basic: { mode: 'offline', config: 'tauri.offline.conf.json', id: 'com.laap.offline', channel: 'offline' },
  studio: { mode: 'studio', config: 'tauri.studio.conf.json', id: 'com.laap.studio', channel: 'studio' },
  complete: { mode: 'production', config: 'tauri.conf.json', id: 'com.laaP.desktop', channel: 'team' },
}
const archived = /useCloudAccounts|session-blob|laap-api\.hussiensalah100|\/api\/leases|load_access_token|inject_account_session/
try {
  for (const [name, info] of Object.entries(editions)) {
    const config = JSON.parse(readFileSync(join(desktop, 'src-tauri', info.config), 'utf8'))
    assert.equal(config.identifier, info.id)
    assert.equal(config.plugins.updater.endpoints[0], 'https://github.com/Kingof3O/laap/releases/latest/download/latest-' + info.channel + '.json')
    assert.deepEqual(config.build.features ?? [], name === 'complete' ? [] : [name])
    assert(config.bundle.createUpdaterArtifacts, name + ' omits signed updater artifacts')
    assert(config.plugins.updater.pubkey, name + ' lost its pinned key')
    const out = join(scratch, name)
    execFileSync(process.execPath, [vite, 'build', '--mode', info.mode, '--outDir', out], {
      cwd: desktop, stdio: 'inherit',
      env: { ...process.env, VITE_COMMUNITY_RELAY_URL: 'wss://example.invalid/v1/rooms/events' },
    })
    const assets = join(out, 'assets')
    const js = readdirSync(assets).filter((file) => file.endsWith('.js'))
      .map((file) => readFileSync(join(assets, file), 'utf8')).join('\n')
    assert(!archived.test(js), name + ' bundles retired Team code')
    for (const command of ['list_local_accounts', 'launch_local_account', 'initialize_presence']) {
      assert.equal(js.includes(command), name !== 'studio', name + ' ' + command)
    }
    for (const command of ['catalog_list', 'customization_preset_save', 'mod_import', 'theme_set_active', 'creator_create_project']) {
      assert.equal(js.includes(command), name !== 'basic', name + ' ' + command)
    }
    assert.equal(js.includes('/v1/rooms/events'), name !== 'basic', name + ' party transport')
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
console.log('Three frontend bundles and updater configuration identities verified.')
