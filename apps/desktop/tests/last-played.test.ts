import assert from 'node:assert/strict'
import test from 'node:test'
import { formatLastPlayed } from '../src/lib/lastPlayed.ts'

const now = new Date(2026, 10, 20, 15, 0, 0)

test('recency labels stay compact on account cards', () => {
  assert.equal(formatLastPlayed(null, now), 'Never')
  assert.equal(formatLastPlayed(new Date(2026, 10, 20, 9).toString(), now), 'Today')
  assert.equal(formatLastPlayed(new Date(2026, 10, 19, 9).toString(), now), 'Yesterday')
  assert.equal(formatLastPlayed(new Date(2026, 10, 17, 9).toString(), now), '3 days ago')
})

test('unparseable labels are preserved rather than erased', () => {
  assert.equal(formatLastPlayed('Recently imported', now), 'Recently imported')
  assert.equal(formatLastPlayed(undefined, now), 'Never')
})
