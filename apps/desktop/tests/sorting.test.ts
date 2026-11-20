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

test('starred profiles support explicit favorites-first order and options.pinFavorites', () => {
  const rows = [
    { id: '1', name: 'Alpha', favorite: false },
    { id: '2', name: 'Zulu', favorite: true },
    { id: '3', name: 'Bravo', favorite: false },
    { id: '4', name: 'Charlie', favorite: true },
  ]
  const favFirst = sortProfiles(rows, 'favorites-first')
  assert.deepEqual(favFirst.map((r) => r.id), ['4', '2', '1', '3'])

  const pinned = sortProfiles(rows, 'name-asc', { pinFavorites: true })
  assert.deepEqual(pinned.map((r) => r.id), ['4', '2', '1', '3'])

  const unpinned = sortProfiles(rows, 'name-asc')
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

test('VALORANT competitive rank hierarchy: Unranked < Iron 1-3 < ... < Radiant', () => {
  const valRanks = [
    'Unranked',
    'Iron 1',
    'Iron 2',
    'Iron 3',
    'Bronze 1',
    'Bronze 2',
    'Bronze 3',
    'Silver 1',
    'Silver 2',
    'Silver 3',
    'Gold 1',
    'Gold 2',
    'Gold 3',
    'Platinum 1',
    'Platinum 2',
    'Platinum 3',
    'Diamond 1',
    'Diamond 2',
    'Diamond 3',
    'Ascendant 1',
    'Ascendant 2',
    'Ascendant 3',
    'Immortal 1',
    'Immortal 2',
    'Immortal 3',
    'Radiant',
  ]

  // Every rank must have a score strictly greater than the previous rank
  let prevScore = -1
  for (const rank of valRanks) {
    const score = rankScore(rank, 'valorant')
    assert.notEqual(score, null, `Expected score for ${rank}`)
    assert.ok(score! > prevScore, `Expected ${rank} (${score}) > previous (${prevScore})`)
    prevScore = score!
  }

  // Also verify Roman numerals (e.g. Iron I, Iron II, Iron III) evaluate identically
  assert.equal(rankScore('Iron I', 'valorant'), rankScore('Iron 1', 'valorant'))
  assert.equal(rankScore('Ascendant III', 'valorant'), rankScore('Ascendant 3', 'valorant'))

  // Unknown / unranked strings without competitive tier
  assert.equal(rankScore('Smurf', 'valorant'), null)
  assert.equal(rankScore(null, 'valorant'), null)

  // Verify sortProfiles with activeGame: 'valorant'
  const unordered = [
    { id: '1', name: 'Profile 1', valorant_rank: 'Gold 2' },
    { id: '2', name: 'Profile 2', valorant_rank: 'Unranked' },
    { id: '3', name: 'Profile 3', valorant_rank: 'Radiant' },
    { id: '4', name: 'Profile 4', valorant_rank: 'Iron 1' },
    { id: '5', name: 'Profile 5', valorant_rank: 'Unknown' },
  ]

  const highToLow = sortProfiles(unordered, 'rank-desc', { activeGame: 'valorant' })
  assert.deepEqual(
    highToLow.map((p) => p.valorant_rank),
    ['Radiant', 'Gold 2', 'Iron 1', 'Unranked', 'Unknown'],
  )

  const lowToHigh = sortProfiles(unordered, 'rank-asc', { activeGame: 'valorant' })
  assert.deepEqual(
    lowToHigh.map((p) => p.valorant_rank),
    ['Unranked', 'Iron 1', 'Gold 2', 'Radiant', 'Unknown'],
  )
})

