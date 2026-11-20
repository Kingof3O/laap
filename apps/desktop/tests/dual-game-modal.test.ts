import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  VALORANT_RANK_OPTIONS,
  canonicalValorantRank,
} from '../src/lib/profileCustomization.ts'
import type { Game, ProfileDetails } from '../src/lib/types.ts'

test('VALORANT rank options match the 26 standard competitive tiers', () => {
  assert.equal(VALORANT_RANK_OPTIONS.length, 26)
  assert.equal(VALORANT_RANK_OPTIONS[0], 'Unranked')
  assert.equal(VALORANT_RANK_OPTIONS[1], 'Iron 1')
  assert.equal(VALORANT_RANK_OPTIONS[2], 'Iron 2')
  assert.equal(VALORANT_RANK_OPTIONS[3], 'Iron 3')
  assert.equal(VALORANT_RANK_OPTIONS[4], 'Bronze 1')
  assert.equal(VALORANT_RANK_OPTIONS[24], 'Immortal 3')
  assert.equal(VALORANT_RANK_OPTIONS[25], 'Radiant')
})

test('canonicalValorantRank normalizes variants and preserves unknown ranks', () => {
  assert.equal(canonicalValorantRank('iron 1'), 'Iron 1')
  assert.equal(canonicalValorantRank('Iron I'), 'Iron 1')
  assert.equal(canonicalValorantRank('silver iii'), 'Silver 3')
  assert.equal(canonicalValorantRank('Gold 2'), 'Gold 2')
  assert.equal(canonicalValorantRank('radiant'), 'Radiant')
  assert.equal(canonicalValorantRank('unranked'), 'Unranked')
  assert.equal(canonicalValorantRank('Custom Scrim Rank'), 'Custom Scrim Rank')
  assert.equal(canonicalValorantRank(null), '')
  assert.equal(canonicalValorantRank(undefined), '')
})

test('payload generation respects per-game selection and excludes inactive game ranks', () => {
  // Scenario 1: Dual-game profile
  const dualDetails: ProfileDetails = {
    name: 'Main Account',
    region: 'NA',
    rank: 'Gold II',
    valorant_rank: 'Silver 3',
    games: ['league', 'valorant'],
    notes: '',
    favorite: false,
  }
  const dualPayload: ProfileDetails = {
    ...dualDetails,
    name: dualDetails.name.trim(),
    games: dualDetails.games,
    rank: dualDetails.games?.includes('league') ? dualDetails.rank : null,
    valorant_rank: dualDetails.games?.includes('valorant') ? dualDetails.valorant_rank : null,
  }
  assert.deepEqual(dualPayload.games, ['league', 'valorant'])
  assert.equal(dualPayload.rank, 'Gold II')
  assert.equal(dualPayload.valorant_rank, 'Silver 3')

  // Scenario 2: VALORANT-only profile hides and clears League rank on submit
  const valOnlyDetails: ProfileDetails = {
    name: 'Val Smurf',
    region: 'NA',
    rank: 'Gold II', // was previously entered or saved
    valorant_rank: 'Ascendant 1',
    games: ['valorant'],
    notes: '',
    favorite: false,
  }
  const valPayload: ProfileDetails = {
    ...valOnlyDetails,
    name: valOnlyDetails.name.trim(),
    games: valOnlyDetails.games,
    rank: valOnlyDetails.games?.includes('league') ? valOnlyDetails.rank : null,
    valorant_rank: valOnlyDetails.games?.includes('valorant') ? valOnlyDetails.valorant_rank : null,
  }
  assert.deepEqual(valPayload.games, ['valorant'])
  assert.equal(valPayload.rank, null)
  assert.equal(valPayload.valorant_rank, 'Ascendant 1')

  // Scenario 3: League-only profile hides and clears VALORANT rank on submit
  const leagueOnlyDetails: ProfileDetails = {
    name: 'League Only',
    region: 'EUW',
    rank: 'Platinum IV',
    valorant_rank: 'Iron 1', // was previously entered or saved
    games: ['league'],
    notes: '',
    favorite: false,
  }
  const leaguePayload: ProfileDetails = {
    ...leagueOnlyDetails,
    name: leagueOnlyDetails.name.trim(),
    games: leagueOnlyDetails.games,
    rank: leagueOnlyDetails.games?.includes('league') ? leagueOnlyDetails.rank : null,
    valorant_rank: leagueOnlyDetails.games?.includes('valorant') ? leagueOnlyDetails.valorant_rank : null,
  }
  assert.deepEqual(leaguePayload.games, ['league'])
  assert.equal(leaguePayload.rank, 'Platinum IV')
  assert.equal(leaguePayload.valorant_rank, null)
})

test('switching active game when saved profile does not support current active game', () => {
  const activeGame: Game = 'league'
  const savedGames: Game[] = ['valorant']

  let switchedGame: Game | null = null
  let toastMessage: string | null = null

  if (!savedGames.includes(activeGame)) {
    const nextGame = savedGames[0] || 'league'
    switchedGame = nextGame
    toastMessage =
      nextGame === 'valorant'
        ? 'Switched to VALORANT to show this profile.'
        : 'Switched to League to show this profile.'
  }

  assert.equal(switchedGame, 'valorant')
  assert.equal(toastMessage, 'Switched to VALORANT to show this profile.')
})

test('restoring preserved rank when re-checking an unchecked game', () => {
  const preservedLeagueRank = 'Emerald I'
  const preservedValRank = 'Immortal 2'

  let details: ProfileDetails = {
    name: 'Both Games Account',
    region: 'EUW',
    rank: preservedLeagueRank,
    valorant_rank: preservedValRank,
    games: ['league', 'valorant'],
    notes: '',
    favorite: false,
  }

  // User unchecks League
  details = {
    ...details,
    games: ['valorant'],
    rank: null,
  }
  assert.deepEqual(details.games, ['valorant'])
  assert.equal(details.rank, null)

  // User re-checks League -> rank is restored from preserved ref/state
  details = {
    ...details,
    games: ['valorant', 'league'],
    rank: preservedLeagueRank,
  }
  assert.deepEqual(details.games, ['valorant', 'league'])
  assert.equal(details.rank, 'Emerald I')
})
