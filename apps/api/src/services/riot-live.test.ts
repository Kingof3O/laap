import { describe, expect, it } from 'vitest'
import { signRiotProxyRequest } from '../http/riot-proxy-auth.js'
import { createRiotWorker } from '../riot-worker.js'
import { RiotLiveTracker, resolveRiotRouting } from './riot-live.js'

const env = {
  RIOT_API_KEY: 'fixture-riot-key-1234',
  LAAP_RIOT_PROXY_TOKEN: 'proxy-secret-token-xyz',
}

function bootRiotProxy(tracker?: RiotLiveTracker) {
  const worker = createRiotWorker(tracker)
  return (init: RequestInit) => worker.fetch(
    new Request('https://laap-api.example.workers.dev/api/riot/live-status', init),
    env,
  )
}

describe('Riot live game proxy & tracker', () => {
  it('routes OCE and SEA shards to asia for account-v1 while keeping platform shards for spectator-v5', () => {
    expect(resolveRiotRouting('OCE')).toEqual({ accountCluster: 'asia', platform: 'oc1' })
    expect(resolveRiotRouting('PH')).toEqual({ accountCluster: 'asia', platform: 'sg2' })
    expect(resolveRiotRouting('ME')).toEqual({ accountCluster: 'europe', platform: 'me1' })
    expect(() => resolveRiotRouting('INVALID')).toThrowError()
  })

  it('rejects unauthenticated requests to /api/riot/live-status', async () => {
    const request = bootRiotProxy()
    const response = await request({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region: 'EUW', gameName: 'Main', tagLine: 'EUW' }),
    })
    expect(response.status).toBe(401)
  })

  it('resolves PUUID once, caches 45s status, and distinguishes active match vs idle', async () => {
    let now = 1_700_000_000_000
    const upstreamUrls: string[] = []
    let matchActive = true

    const tracker = new RiotLiveTracker(async (input) => {
      const url = typeof input === 'string' ? input : input.toString()
      upstreamUrls.push(url)
      if (url.includes('/riot/account/v1/accounts/by-riot-id/')) {
        return new Response(JSON.stringify({ puuid: 'puuid-euw-001' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/lol/spectator/v5/active-games/by-summoner/puuid-euw-001')) {
        if (!matchActive) {
          return new Response(JSON.stringify({ status: { status_code: 404 } }), { status: 404 })
        }
        return new Response(
          JSON.stringify({
            gameId: 998877,
            gameMode: 'CLASSIC',
            gameType: 'MATCHED_GAME',
            gameQueueConfigId: 420,
            gameLength: 425,
            gameStartTime: 1_700_000_000_000,
            participants: [{ puuid: 'puuid-euw-001', championId: 103 }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('Unexpected route', { status: 500 })
    }, () => now)

    const request = bootRiotProxy(tracker)

    const headers = {
      'Content-Type': 'application/json',
      'X-Laap-Riot-Token': 'proxy-secret-token-xyz',
    }

    const first = await request({
      method: 'POST',
      headers,
      body: JSON.stringify({ region: 'EUW', gameName: 'Kingof3O', tagLine: 'EUW' }),
    })
    expect(first.status).toBe(200)
    const firstBody = await first.json() as Record<string, unknown>
    expect(firstBody).toMatchObject({
      inGame: true,
      puuid: 'puuid-euw-001',
      platform: 'euw1',
      cached: false,
      gameMode: 'CLASSIC',
      queueId: 420,
      gameLengthSeconds: 425,
      championId: 103,
    })
    expect(upstreamUrls).toHaveLength(2)

    // Repeat call within 45s serves cache without calling Riot upstream
    now += 10_000
    const second = await request({
      method: 'POST',
      headers,
      body: JSON.stringify({ region: 'EUW', gameName: 'Kingof3O', tagLine: 'EUW' }),
    })
    expect(second.status).toBe(200)
    const secondBody = await second.json() as Record<string, unknown>
    expect(secondBody.cached).toBe(true)
    expect(upstreamUrls).toHaveLength(2)

    // After cache expiry, PUUID remains cached so only spectator-v5 is called
    matchActive = false
    now += 50_000
    const third = await request({
      method: 'POST',
      headers,
      body: JSON.stringify({ region: 'EUW', gameName: 'Kingof3O', tagLine: 'EUW' }),
    })
    expect(third.status).toBe(200)
    const thirdBody = await third.json() as Record<string, unknown>
    expect(thirdBody).toMatchObject({ inGame: false, cached: false, puuid: 'puuid-euw-001' })
    expect(upstreamUrls).toHaveLength(3)
    expect(upstreamUrls[2]).toContain('/lol/spectator/v5/active-games/by-summoner/puuid-euw-001')
  })

  it('enforces Retry-After cooldown on upstream 429 without hammering Riot API', async () => {
    let now = 1_700_000_000_000
    let upstreamCalls = 0
    const tracker = new RiotLiveTracker(async () => {
      upstreamCalls++
      return new Response('Rate limit exceeded', {
        status: 429,
        headers: { 'Retry-After': '12' },
      })
    }, () => now)

    const request = bootRiotProxy(tracker)
    const headers = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer proxy-secret-token-xyz',
    }

    const res1 = await request({
      method: 'POST',
      headers,
      body: JSON.stringify({ region: 'NA', puuid: 'puuid-na-001' }),
    })
    expect(res1.status).toBe(429)
    expect(res1.headers.get('retry-after')).toBe('12')
    expect(upstreamCalls).toBe(1)

    now += 3_000
    const res2 = await request({
      method: 'POST',
      headers,
      body: JSON.stringify({ region: 'NA', puuid: 'puuid-na-001' }),
    })
    expect(res2.status).toBe(429)
    expect(res2.headers.get('retry-after')).toBe('9')
    expect(upstreamCalls).toBe(1)
  })

  it('standalone Cloudflare riot-worker authenticates, validates origin, and checks live status', async () => {
    const tracker = new RiotLiveTracker(async () =>
      new Response(JSON.stringify({ status: { status_code: 404 } }), { status: 404 }),
    )
    const worker = createRiotWorker(tracker)
    const env = {
      NODE_ENV: 'production',
      ALLOWED_ORIGIN: 'https://laap-control-center.pages.dev',
      RIOT_API_KEY: 'fixture-riot-key-1234',
      LAAP_RIOT_PROXY_TOKEN: 'worker-secret-token-xyz',
    }

    const health = await worker.fetch(new Request('https://laap-api.example.workers.dev/api/health'), env)
    expect(health.status).toBe(200)
    expect(await health.json()).toMatchObject({ status: 'ok', service: 'laap-api', mode: 'riot-live-proxy' })

    const ready = await worker.fetch(new Request('https://laap-api.example.workers.dev/api/ready'), env)
    expect(ready.status).toBe(200)
    expect(await ready.json()).toMatchObject({ status: 'ready', riotConfigured: true, tokenConfigured: true })

    const badOrigin = await worker.fetch(
      new Request('https://laap-api.example.workers.dev/api/riot/live-status', {
        method: 'POST',
        headers: { Origin: 'https://evil.example.com' },
      }),
      env,
    )
    expect(badOrigin.status).toBe(403)

    const badAuth = await worker.fetch(
      new Request('https://laap-api.example.workers.dev/api/riot/live-status', {
        method: 'POST',
        headers: { 'X-Laap-Riot-Token': 'wrong-token' },
        body: JSON.stringify({ region: 'EUW', puuid: 'puuid-worker-001' }),
      }),
      env,
    )
    expect(badAuth.status).toBe(401)

    const valid = await worker.fetch(
      new Request('https://laap-api.example.workers.dev/api/riot/live-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Laap-Riot-Token': 'worker-secret-token-xyz',
        },
        body: JSON.stringify({ region: 'OCE', puuid: 'puuid-worker-001' }),
      }),
      env,
    )
    expect(valid.status).toBe(200)
    expect(await valid.json()).toMatchObject({ inGame: false, platform: 'oc1', puuid: 'puuid-worker-001' })
  })

  it('verifies HMAC-SHA256 signed requests and rejects replays, expired timestamps, and body tampering', async () => {
    let nowMs = 1_794_634_800_000
    const tracker = new RiotLiveTracker(async () =>
      new Response(JSON.stringify({ status: { status_code: 404 } }), { status: 404 }),
      () => nowMs,
    )
    const worker = createRiotWorker(tracker, undefined, () => nowMs)
    const env = {
      NODE_ENV: 'production',
      RIOT_API_KEY: 'fixture-riot-key-1234',
      LAAP_RIOT_PROXY_TOKEN: 'hmac-shared-secret-xyz',
      LAAP_REQUIRE_HMAC: 'true',
    }

    const bodyText = JSON.stringify({ region: 'EUW', puuid: 'puuid-hmac-001' })
    const bodyBytes = new TextEncoder().encode(bodyText)
    const timestamp = String(Math.floor(nowMs / 1000))
    const nonce = 'nonce-abcdef123456'
    const signature = await signRiotProxyRequest({
      secret: env.LAAP_RIOT_PROXY_TOKEN,
      timestamp,
      nonce,
      method: 'POST',
      pathAndQuery: '/api/riot/live-status',
      bodyBytes,
    })

    // Static token alone is blocked when LAAP_REQUIRE_HMAC is enabled
    const staticRejected = await worker.fetch(
      new Request('https://laap-api.example.workers.dev/api/riot/live-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Laap-Riot-Token': env.LAAP_RIOT_PROXY_TOKEN },
        body: bodyText,
      }),
      env,
    )
    expect(staticRejected.status).toBe(401)

    // Signed request succeeds
    const okRes = await worker.fetch(
      new Request('https://laap-api.example.workers.dev/api/riot/live-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Laap-Timestamp': timestamp,
          'X-Laap-Nonce': nonce,
          'X-Laap-Signature': signature,
        },
        body: bodyText,
      }),
      env,
    )
    expect(okRes.status).toBe(200)

    // Exact replay with same nonce is rejected
    const replayRes = await worker.fetch(
      new Request('https://laap-api.example.workers.dev/api/riot/live-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Laap-Timestamp': timestamp,
          'X-Laap-Nonce': nonce,
          'X-Laap-Signature': signature,
        },
        body: bodyText,
      }),
      env,
    )
    expect(replayRes.status).toBe(401)

    // Tampered body invalidates signature
    const tamperedSig = await signRiotProxyRequest({
      secret: env.LAAP_RIOT_PROXY_TOKEN,
      timestamp,
      nonce: 'nonce-fresh-tamper-01',
      method: 'POST',
      pathAndQuery: '/api/riot/live-status',
      bodyBytes,
    })
    const tamperedRes = await worker.fetch(
      new Request('https://laap-api.example.workers.dev/api/riot/live-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Laap-Timestamp': timestamp,
          'X-Laap-Nonce': 'nonce-fresh-tamper-01',
          'X-Laap-Signature': tamperedSig,
        },
        body: JSON.stringify({ region: 'EUW', puuid: 'puuid-attacker-999' }),
      }),
      env,
    )
    expect(tamperedRes.status).toBe(401)

    // Expired timestamp (>60s drift) is rejected
    const staleTimestamp = String(Math.floor(nowMs / 1000) - 90)
    const staleSig = await signRiotProxyRequest({
      secret: env.LAAP_RIOT_PROXY_TOKEN,
      timestamp: staleTimestamp,
      nonce: 'nonce-stale-window-01',
      method: 'POST',
      pathAndQuery: '/api/riot/live-status',
      bodyBytes,
    })
    const staleRes = await worker.fetch(
      new Request('https://laap-api.example.workers.dev/api/riot/live-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Laap-Timestamp': staleTimestamp,
          'X-Laap-Nonce': 'nonce-stale-window-01',
          'X-Laap-Signature': staleSig,
        },
        body: bodyText,
      }),
      env,
    )
    expect(staleRes.status).toBe(401)
  })

  it('ignores local RSO UUID and re-resolves stale encrypted PUUID on upstream HTTP 400 when Riot ID is provided', async () => {
    const tracker = new RiotLiveTracker(async (input) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/lol/spectator/v5/active-games/by-summoner/old-app-encrypted-puuid')) {
        return new Response('Exception decrypting', { status: 400 })
      }
      if (url.includes('/riot/account/v1/accounts/by-riot-id/Kingof3O/EUW')) {
        return new Response(JSON.stringify({ puuid: 'fresh-app-encrypted-puuid-01' }), { status: 200 })
      }
      if (url.includes('/lol/spectator/v5/active-games/by-summoner/fresh-app-encrypted-puuid-01')) {
        return new Response(JSON.stringify({ status: { status_code: 404 } }), { status: 404 })
      }
      return new Response('Unexpected route', { status: 500 })
    })

    // Local 36-char UUID falls back seamlessly to account-v1 when Riot ID is given
    const fromUuid = await tracker.lookup(
      {
        region: 'EUW',
        puuid: '12345678-1234-1234-1234-1234567890ab',
        gameName: 'Kingof3O',
        tagLine: 'EUW',
      },
      'fixture-key',
    )
    expect(fromUuid).toMatchObject({ inGame: false, puuid: 'fresh-app-encrypted-puuid-01', platform: 'euw1' })

    // Local UUID without Riot ID fails fast with 400 INVALID_PUUID
    await expect(
      tracker.lookup({ region: 'EUW', puuid: '12345678-1234-1234-1234-1234567890ab' }, 'fixture-key'),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_PUUID' })

    // Stale encrypted PUUID returning HTTP 400 auto-recovers via account-v1 when Riot ID is present
    const recovered = await tracker.lookup(
      {
        region: 'EUW',
        puuid: 'old-app-encrypted-puuid',
        gameName: 'Kingof3O',
        tagLine: 'EUW',
        bypassCache: true,
      },
      'fixture-key',
    )
    expect(recovered).toMatchObject({ inGame: false, puuid: 'fresh-app-encrypted-puuid-01', platform: 'euw1' })
  })
})
