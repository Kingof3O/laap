import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { strict as assert } from 'node:assert'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { approvedCatalogHandler, loadApprovedCatalog } from '../src/catalog.ts'
import { createCommunityServer } from '../src/party.ts'

test('catalog serves only reviewed hashes, refuses unknown fields, and detects changed bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'laap-approved-test-'))
  // This is a server transport fixture; native ZIP validation is tested separately.
  const bytes = Buffer.from('504b030474657374', 'hex')
  const hash = createHash('sha256').update(bytes).digest('hex')
  const origin = 'http://tauri.localhost'
  const origins = new Set([origin])
  const manifest = {
    schemaVersion: 1, sha256: hash, displayName: 'Test package', modId: 'test.package', version: '1',
    author: 'Test author', license: 'CC0-1.0', rightToDistribute: true, containsPaidRiotContent: false,
    supportedGameBuilds: [], files: [{ relativePath: 'image.png', sha256: hash, sizeBytes: bytes.length }],
  }
  const manifestPath = join(directory, hash + '.json')
  const zipPath = join(directory, hash + '.zip')
  try {
    await writeFile(zipPath, bytes)
    await writeFile(manifestPath, JSON.stringify({ ...manifest, sessionBlob: 'synthetic, should never be served' }))
    await assert.rejects(loadApprovedCatalog(directory), /missing required rights/)
    await writeFile(manifestPath, JSON.stringify(manifest))
    const catalog = approvedCatalogHandler(directory, await loadApprovedCatalog(directory), origins)
    const relay = createCommunityServer({ origins, catalog })
    relay.server.listen(0, '127.0.0.1')
    await once(relay.server, 'listening')
    try {
      const address = relay.server.address()
      assert(address && typeof address !== 'string')
      const base = 'http://127.0.0.1:' + address.port + '/v1/catalog/mods'
      const response = await fetch(base, { headers: { Origin: origin } })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('access-control-allow-origin'), origin)
      assert.deepEqual((await response.json()).map((entry: { hash: string }) => entry.hash), [hash])
      const download = base + '/' + hash + '/download'
      assert.deepEqual(Buffer.from(await (await fetch(download)).arrayBuffer()), bytes)
      assert.equal((await fetch(base + '/' + 'a'.repeat(64))).status, 404)
      await writeFile(zipPath, Buffer.from('different bytes'))
      assert.equal((await fetch(download)).status, 503)
    } finally {
      await relay.close()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
