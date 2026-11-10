import { strict as assert } from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { test } from 'node:test'
import { ModerationStore } from '../src/moderation.ts'
import { createCommunityServer } from '../src/party.ts'

test('reports use separate storage, enforce admin authorization and immediately block packages', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'laap-moderation-test-'))
  const database = join(directory, 'moderation.sqlite')
  const store = new ModerationStore(database)
  const token = 'synthetic-test-token-'.repeat(3)
  const origins = new Set(['http://tauri.localhost'])
  const relay = createCommunityServer({ origins, moderation: store.handler(origins, token) })
  relay.server.listen(0, '127.0.0.1')
  await once(relay.server, 'listening')
  const address = relay.server.address()
  assert(address && typeof address !== 'string')
  const base = 'http://127.0.0.1:' + address.port
  const hash = 'a'.repeat(64)
  try {
    const invalid = await fetch(base + '/v1/catalog/mods/' + hash + '/report', {
      method: 'POST', body: JSON.stringify({ reason: 'broken', notes: '', sessionBlob: 'reject this field' }),
    })
    assert.equal(invalid.status, 400)
    const report = await fetch(base + '/v1/catalog/mods/' + hash + '/report', {
      method: 'POST', body: JSON.stringify({ reason: 'broken', notes: 'Synthetic transport test' }),
    })
    assert.equal(report.status, 201)
    assert.equal((await fetch(base + '/v1/moderation/reports')).status, 401)
    const reports = await fetch(base + '/v1/moderation/reports', { headers: { authorization: 'Bearer ' + token } })
    assert.equal((await reports.json()).length, 1)
    assert.equal(store.isBlocked(hash), false)
    const blocked = await fetch(base + '/v1/moderation/block', {
      method: 'POST', headers: { authorization: 'Bearer ' + token },
      body: JSON.stringify({ hash, reason: 'Test takedown' }),
    })
    assert.equal(blocked.status, 200)
    assert.equal(store.isBlocked(hash), true)
  } finally {
    await relay.close()
    store.close()
    const reopened = new ModerationStore(database)
    try { assert.equal(reopened.isBlocked(hash), true) }
    finally { reopened.close(); await rm(directory, { recursive: true, force: true }) }
  }
})
