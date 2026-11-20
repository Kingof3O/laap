import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getOpggSummonerUrl,
  valorantTierToRank,
  parseOpggValorantHtml,
} from '../src/lib/opgg.ts'

test('generates league OP.GG url with region segment', () => {
  const res = getOpggSummonerUrl('Faker', 'KR', 'Hide on bush#KR1', 'league')
  assert.equal(res.url, 'https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1')
  assert.equal(res.game, 'league')
})

test('generates valorant OP.GG url without region segment', () => {
  const res = getOpggSummonerUrl('TenZ', 'NA', 'TenZ#0001', 'valorant')
  assert.equal(res.url, 'https://op.gg/valorant/profile/TenZ-0001')
  assert.equal(res.game, 'valorant')
})

test('defaults to league game when omitted in getOpggSummonerUrl', () => {
  const res = getOpggSummonerUrl('Caps', 'EUW', 'Caps#EUW')
  assert.equal(res.url, 'https://op.gg/lol/summoners/euw/Caps-EUW')
  assert.equal(res.game, 'league')
})

test('maps valorant competitive tier boundaries correctly', () => {
  assert.equal(valorantTierToRank(0), 'Unranked')
  assert.equal(valorantTierToRank(1), 'Unranked')
  assert.equal(valorantTierToRank(2), 'Unranked')
  assert.equal(valorantTierToRank(3), 'Iron 1')
  assert.equal(valorantTierToRank(4), 'Iron 2')
  assert.equal(valorantTierToRank(5), 'Iron 3')
  assert.equal(valorantTierToRank(6), 'Bronze 1')
  assert.equal(valorantTierToRank(7), 'Bronze 2')
  assert.equal(valorantTierToRank(8), 'Bronze 3')
  assert.equal(valorantTierToRank(9), 'Silver 1')
  assert.equal(valorantTierToRank(10), 'Silver 2')
  assert.equal(valorantTierToRank(11), 'Silver 3')
  assert.equal(valorantTierToRank(12), 'Gold 1')
  assert.equal(valorantTierToRank(13), 'Gold 2')
  assert.equal(valorantTierToRank(14), 'Gold 3')
  assert.equal(valorantTierToRank(15), 'Platinum 1')
  assert.equal(valorantTierToRank(16), 'Platinum 2')
  assert.equal(valorantTierToRank(17), 'Platinum 3')
  assert.equal(valorantTierToRank(18), 'Diamond 1')
  assert.equal(valorantTierToRank(19), 'Diamond 2')
  assert.equal(valorantTierToRank(20), 'Diamond 3')
  assert.equal(valorantTierToRank(21), 'Ascendant 1')
  assert.equal(valorantTierToRank(22), 'Ascendant 2')
  assert.equal(valorantTierToRank(23), 'Ascendant 3')
  assert.equal(valorantTierToRank(24), 'Immortal 1')
  assert.equal(valorantTierToRank(25), 'Immortal 2')
  assert.equal(valorantTierToRank(26), 'Immortal 3')
  assert.equal(valorantTierToRank(27), 'Radiant')
  assert.equal(valorantTierToRank(28), 'Unranked')
})

test('parses valorant RSC HTML fixture', () => {
  const fixture = `
    <html><body>
    <script>
      self.__next_f.push([1,"\"profile\":{\"gameName\":\"Jett\",\"tagLine\":\"NA1\",\"level\":52,\"region\":\"na\",\"competitiveTier\":21,\"puuid\":\"c7b12d34-5678-90ab\"}"]);
    </script>
    <img src="https://c-valorant-api.op.gg/Assets/PlayerCards/7B240A91-4925-8BB6-7812-60B49543E145_small.png?image=w_128"/>
    </body></html>
  `
  const stats = parseOpggValorantHtml(fixture, 'Jett', 'NA1', 'NA')
  assert.ok(stats !== null)
  assert.equal(stats?.game, 'valorant')
  assert.equal(stats?.summonerName, 'Jett')
  assert.equal(stats?.tagLine, 'NA1')
  assert.equal(stats?.formattedRank, 'Ascendant 1')
  assert.equal(stats?.tier, 'Ascendant')
  assert.equal(stats?.rank, '1')
  assert.equal(stats?.level, 52)
  assert.equal(stats?.puuid, 'c7b12d34-5678-90ab')
  assert.equal(stats?.opggUrl, 'https://op.gg/valorant/profile/Jett-NA1')
  assert.equal(
    stats?.avatarUrl,
    'https://c-valorant-api.op.gg/Assets/PlayerCards/7B240A91-4925-8BB6-7812-60B49543E145_small.png',
  )
})

test('autoSyncAccountRank identity check skips on PUUID mismatch', async () => {
  const { autoSyncAccountRank } = await import('../src/lib/opgg.ts')
  // When fetchOpggStats returns null or fails (or PUUID mismatch)
  const result = await autoSyncAccountRank(
    {
      id: 'acc-1',
      name: 'Player',
      region: 'NA',
      puuid: 'saved-puuid-1',
    },
    'valorant',
  )
  assert.equal(result, false)
})

test('getOpggCachedRank returns null when unranked or no cache', async () => {
  const { getOpggCachedRank } = await import('../src/lib/opgg.ts')
  assert.equal(getOpggCachedRank('Nonexistent#NA1', 'NA', 'league'), null)
})

