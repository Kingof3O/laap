import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runBatch } from '../src/features/customization/batchOperations.ts'
import { ProjectSaveQueue, validateSnapshot } from '../src/features/customization/projectPersistence.ts'

test('100-package batch keeps precise successes, errors and retry selection', async () => {
  const ids = Array.from({ length: 100 }, (_, n) => String(n))
  const visited: string[] = []
  const result = await runBatch([...ids, '0'], async id => {
    visited.push(id)
    if (id === '12' || id === '85') throw Error(`Package ${id} is locked`)
  }, new AbortController().signal)
  assert.equal(visited.length, 100)
  assert.equal(result.succeeded.length, 98)
  assert.deepEqual(result.failed.map(f => f.id), ['12', '85'])
  assert.match(result.failed[0].error, /locked/)
  assert.deepEqual(result.cancelled, [])
})

test('cancellation retains committed operation and does not start the rest', async () => {
  const controller = new AbortController()
  const result = await runBatch(['a', 'b', 'c'], async () => { controller.abort() }, controller.signal)
  assert.deepEqual(result, { succeeded: ['a'], failed: [], cancelled: ['b', 'c'] })
})

const draft = { id: 'project-a', name: 'Original', author: 'Artist', version: '1', description: '', champion: 'Ahri',
  skinNum: 0, tags: [], files: [], createdAt: '2026-11-12T00:00:00Z', updatedAt: '2026-11-12T00:00:00Z' }

test('save queue serializes rapid edits and remains usable after a failed save', async () => {
  const writes: string[] = []
  let inFlight = 0
  const queue = new ProjectSaveQueue(async project => {
    assert.equal(inFlight++, 0)
    await new Promise(resolve => setTimeout(resolve, 5))
    inFlight--
    if (project.name === 'Fail') throw Error('Disk full')
    writes.push(project.name)
    return project
  })
  const first = queue.enqueue(draft)
  const second = queue.enqueue({ ...draft, name: 'Fail' })
  const third = queue.enqueue({ ...draft, name: 'Latest' })
  draft.name = 'Mutated after enqueue'
  const result = await Promise.allSettled([first, second, third])
  assert.deepEqual(result.map(r => r.status), ['fulfilled', 'rejected', 'fulfilled'])
  assert.deepEqual(writes, ['Original', 'Latest'])
})

test('recovery rejects cross-project, malformed and oversized snapshots', () => {
  assert.equal(validateSnapshot(draft, draft.id).id, draft.id)
  assert.throws(() => validateSnapshot(draft, 'another-project'))
  assert.throws(() => validateSnapshot({ ...draft, files: [{}] }, draft.id))
  assert.throws(() => validateSnapshot({ ...draft, skinNum: -1 }, draft.id))
  assert.throws(() => validateSnapshot({ ...draft, description: 'x'.repeat(9 * 1024 * 1024) }, draft.id))
})
