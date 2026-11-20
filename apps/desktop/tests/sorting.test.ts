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

test('starred profiles are pinned first by default and support explicit favorites-first order', () => {
  const rows = [
    { id: '1', name: 'Alpha', favorite: false },
    { id: '2', name: 'Zulu', favorite: true },
    { id: '3', name: 'Bravo', favorite: false },
    { id: '4', name: 'Charlie', favorite: true },
  ]
  const sorted = sortProfiles(rows, 'name-asc')
  // Charlie and Zulu are favorites, so they appear first (in name-asc order: Charlie, then Zulu)
  // followed by Alpha, then Bravo
  assert.deepEqual(sorted.map((r) => r.id), ['4', '2', '1', '3'])

  const unpinned = sortProfiles(rows, 'name-asc', { pinFavorites: false })
  assert.deepEqual(unpinned.map((r) => r.id), ['1', '3', '4', '2'])
})

test('region and status sorting works ascending and descending', () => {
  const rows = [
    { id: '1', name: 'First', region: 'NA', status: 'Ready' },
    { id: '2', name: 'Second', region: 'EUW', status: 'In Use' },
  ]
  assert.equal(sortProfiles(rows, 'region-asc')[0].id, '2')
  assert.equal(sortProfiles(rows, 'region-desc')[0].id, '1')
  assert.equal(sortProfiles(rows, 'status-asc')[0].id, '2')
  assert.equal(sortProfiles(rows, 'status-desc')[0].id, '1')
})
