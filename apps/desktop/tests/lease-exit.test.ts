import assert from 'node:assert/strict'
import test from 'node:test'
import { releasePersistedCloudLease } from '../src/features/team-vault/leaseExit.ts'
test('tray quit releases a persisted cloud lease even when its view unmounted', async () => {
  const values = new Map([['laap_active_lease_v1', JSON.stringify({ sessionId: 'cloud-123' })]])
  const storage = { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key) }
  const released: string[] = []
  await releasePersistedCloudLease(storage, async (id) => { released.push(id) })
  assert.deepEqual(released, ['cloud-123'])
  assert.equal(values.has('laap_active_lease_v1'), false)
})
test('retain the persisted lease when the server release fails', async () => {
  const values = new Map([['laap_active_lease_v1', JSON.stringify({ sessionId: 'cloud-123' })]])
  const storage = { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key) }
  await assert.rejects(() => releasePersistedCloudLease(storage, async () => { throw new Error('offline') }))
  assert.equal(values.has('laap_active_lease_v1'), true)
})

test('switching from a cloud profile releases its lease and restores Riot before local launch', async () => {
  const values = new Map([['laap_active_lease_v1', JSON.stringify({ sessionId: 'cloud-456' })]])
  const storage = { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key) }
  const events: string[] = []
  await releasePersistedCloudLease(storage, async () => { events.push('release') }, async () => { events.push('restore') })
  assert.deepEqual(events, ['release', 'restore'])
  assert.equal(values.has('laap_active_lease_v1'), false)
})
