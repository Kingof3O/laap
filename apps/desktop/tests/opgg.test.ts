import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getOpggSummonerUrl,
  getOpggCachedRank,
  fetchOpggStats,
  valorantTierToRank,
  parseOpggValorantHtml,
  parseOpggMetaDescription,
  extractLeagueLevel,
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

test('only Riot IDs with a name and a single nonempty tag are linked', () => {
  for (const input of ['Player', 'Player# ', '#NA1', 'Player#NA1#extra']) {
    assert.equal(getOpggSummonerUrl(input, 'NA', null, 'valorant').hasTag, false)
  }
  assert.equal(getOpggSummonerUrl(' Player # NA1 ', 'NA', null, 'valorant').hasTag, true)
})

test('getOpggCachedRank returns null when unranked or no cache', async () => {
  assert.equal(getOpggCachedRank('Nonexistent#NA1', 'NA', 'league'), null)
})

test('League cache isolates matching Riot IDs on different regions', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url: string) => {
    const rank = url.includes('/euw/') ? 'Gold 2 50 LP' : 'Silver 1 25 LP'
    return new Response(`<meta name="description" content="Cache Test / ${rank}">`)
  })

  await fetchOpggStats('Cache Test#QA', 'EUW')
  await fetchOpggStats('Cache Test#QA', 'NA')
  assert.match(getOpggCachedRank('Cache Test#QA', 'EUW') ?? '', /Gold II/)
  assert.match(getOpggCachedRank('Cache Test#QA', 'NA') ?? '', /Silver I/)
  assert.equal(fetch.mock.callCount(), 2)
})

test('parses league account level from html and rsc fixtures', () => {
  const htmlFixture = `
    <html><head><meta name="description" content="Kingof3O#2516 / Platinum 2 12 LP / 66Win 65Lose Win rate 50%"></head><body>
      <div class="relative">
        <img src="https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon3458.jpg?image=q_auto:good"/>
        <div class="mt-[-11px] text-center"><span class="inline-flex h-5 rounded-[10px] bg-[var(--color-gray-900)] px-2 text-[12px] leading-5 text-white">197</span></div>
      </div>
    </body></html>
  `
  assert.equal(extractLeagueLevel(htmlFixture), 197)
  const stats = parseOpggMetaDescription(
    'Kingof3O#2516 / Platinum 2 12 LP / 66Win 65Lose Win rate 50%',
    'Kingof3O',
    '2516',
    'EUNE',
    htmlFixture,
  )
  assert.equal(stats.level, 197)
  assert.equal(stats.formattedRank, 'Platinum II (12 LP)')
  assert.equal(stats.wins, 66)
  assert.equal(stats.losses, 65)

  const rscFixture = `
    "className":"mt-[-11px] text-center","children":["$","span",null,{"className":"inline-flex text-white","children":946}]
  `
  assert.equal(extractLeagueLevel(rscFixture), 946)
})

test('parses league top champions from meta description with icon mapping', () => {
  const meta =
    'Kingof3O#EUW / Platinum 2 17 LP / 136Win 139Lose Win rate 49% / Wukong - 115Win 120Lose Win rate 49%, Diana - 22Win 26Lose Win rate 46%, Nocturne - 5Win 6Lose Win rate 45%'
  const stats = parseOpggMetaDescription(meta, 'Kingof3O', 'EUW', 'EUW')
  assert.ok(stats.topChampions)
  assert.equal(stats.topChampions.length, 3)
  assert.equal(stats.topChampions[0].name, 'Wukong')
  assert.equal(stats.topChampions[0].wins, 115)
  assert.equal(stats.topChampions[0].losses, 120)
  assert.equal(stats.topChampions[0].winRate, 49)
  assert.equal(stats.topChampions[0].count, 235)
  assert.equal(
    stats.topChampions[0].iconUrl,
    'https://opgg-static.akamaized.net/meta/images/lol/latest/champion/MonkeyKing.png',
  )
  assert.equal(stats.topChampions[1].name, 'Diana')
  assert.equal(
    stats.topChampions[1].iconUrl,
    'https://opgg-static.akamaized.net/meta/images/lol/latest/champion/Diana.png',
  )
})

test('parses valorant rr, combat stats, and top agents from html fixture', () => {
  const fixture = `
    <html><body>
    <script>
      self.__next_f.push([1,"\"profile\":{\"gameName\":\"Kingof3O\",\"tagLine\":\"2516\",\"level\":286,\"region\":\"eu\",\"competitiveTier\":11,\"rank\":64,\"wins\":42,\"losses\":38,\"winRate\":53,\"kd\":1.15,\"headshotRate\":26,\"puuid\":\"test-val-puuid\"}"]);
      self.__next_f.push([1,"\"agentStats\":[{\"characterId\":\"ADD6443A-41BD-E414-F6AD-E58D267F4E95\",\"agentName\":\"Jett\",\"win\":24,\"lose\":16,\"play\":40,\"winRate\":60},{\"characterId\":\"A3BFB853-43B2-7238-A4F1-AD90E9E46BCC\",\"agentName\":\"Reyna\",\"win\":12,\"lose\":10,\"play\":22,\"winRate\":55}]"]);
    </script>
    </body></html>
  `
  const stats = parseOpggValorantHtml(fixture, 'Kingof3O', '2516', 'EUNE')
  assert.ok(stats)
  assert.equal(stats.game, 'valorant')
  assert.equal(stats.formattedRank, 'Silver 3')
  assert.equal(stats.rr, 64)
  assert.equal(stats.wins, 42)
  assert.equal(stats.losses, 38)
  assert.equal(stats.winRate, 53)
  assert.equal(stats.formattedWinRate, '42W - 38L (53%)')
  assert.ok(stats.combatStats)
  assert.equal(stats.combatStats.kd, 1.15)
  assert.equal(stats.combatStats.headshotRate, 26)
  assert.ok(stats.topChampions)
  assert.equal(stats.topChampions.length, 2)
  assert.equal(stats.topChampions[0].name, 'Jett')
  assert.equal(stats.topChampions[0].winRate, 60)
  assert.equal(stats.topChampions[0].count, 40)
  assert.ok(stats.topChampions[0].iconUrl.includes('ADD6443A-41BD-E414-F6AD-E58D267F4E95'))
})

test('parses valorant mostCharacterId when no active season agent stats', () => {
  const fixture = `
    <html><body>
    <script>
      self.__next_f.push([1,"\"profile\":{\"gameName\":\"Kingof3O\",\"tagLine\":\"2516\",\"level\":286,\"region\":\"eu\",\"competitiveTier\":11,\"rank\":null,\"mostCharacterId\":\"A3BFB853-43B2-7238-A4F1-AD90E9E46BCC\",\"puuid\":\"test-val-puuid\"}"]);
    </script>
    </body></html>
  `
  const stats = parseOpggValorantHtml(fixture, 'Kingof3O', '2516', 'EUNE')
  assert.ok(stats)
  assert.equal(stats.formattedRank, 'Silver 3')
  assert.equal(stats.level, 286)
  assert.equal(stats.rr, undefined)
  assert.ok(stats.topChampions)
  assert.equal(stats.topChampions.length, 1)
  assert.equal(stats.topChampions[0].name, 'Reyna')
  assert.ok(stats.topChampions[0].iconUrl.includes('A3BFB853-43B2-7238-A4F1-AD90E9E46BCC'))
})
