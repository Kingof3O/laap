import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankScore, sortProfiles } from '../src/lib/sorting.ts'
test('competitive rank hierarchy with unknown ranks always last', () => {
  const ranks = [
    'Smurf',
    'Gold I',
    'Iron IV',
    'Challenger',
    'Diamond 2',
    null,
    'Master',
    'Diamond I',
    'Diamond II',
    'ARAM Only',
  ]
  const profiles = ranks.map((rank, index) => ({
    id: String(index),
    name: `Account ${index}`,
    rank,
  }))
  assert.equal(rankScore('Diamond 2'), 6.3)
  assert.equal(rankScore('Diamond II'), 6.3)
  const high = sortProfiles(profiles, 'rank-desc').map((a) => a.rank)
  assert.deepEqual(high.slice(0, 7), [
    'Challenger',
    'Master',
    'Diamond I',
    'Diamond 2',
    'Diamond II',
    'Gold I',
    'Iron IV',
  ])
  const low = sortProfiles(profiles, 'rank-asc').map((a) => a.rank)
  assert.deepEqual(low.slice(0, 7), [
    'Iron IV',
    'Gold I',
    'Diamond 2',
    'Diamond II',
    'Diamond I',
    'Master',
    'Challenger',
  ])
  assert.ok(high.slice(-3).every((rank) => rankScore(rank) === null))
  assert.ok(low.slice(-3).every((rank) => rankScore(rank) === null))
  assert.deepEqual(
    profiles.map((p) => p.rank),
    ranks,
  )
})
test('name, last-played, and date-added orders are stable', () => {
  const rows = [
    { id: 'b', name: 'Zulu', created_at: '2026-01-01', last_used_at: null },
    {
      id: 'a',
      name: 'Alpha',
      created_at: '2026-02-01',
      last_used_at: '2026-03-01',
    },
  ]
  for (const order of ['name-asc', 'last-played', 'added-desc'] as const)
    assert.equal(sortProfiles(rows, order)[0].id, 'a')
  for (const order of ['name-desc', 'added-asc'] as const)
    assert.equal(sortProfiles(rows, order)[0].id, 'b')
})

test('every sorting option orders by its declared field', () => {
  const rows = [
    { id: 'a', name: 'Alpha', rank: 'Gold I', created_at: '2026-01-01', last_used_at: '2026-03-01' },
    { id: 'b', name: 'Zulu', rank: 'Diamond I', created_at: '2026-02-01', last_used_at: '2026-02-01' },
  ]
  const expected = { 'name-asc': 'a', 'name-desc': 'b', 'rank-asc': 'a', 'rank-desc': 'b', 'last-played': 'a', 'added-asc': 'a', 'added-desc': 'b' } as const
  for (const [order, id] of Object.entries(expected))
    assert.equal(sortProfiles(rows, order as keyof typeof expected)[0].id, id, order)
})
