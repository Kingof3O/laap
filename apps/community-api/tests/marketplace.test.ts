import { strict as assert } from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { test } from 'node:test'
import { MarketplaceStore } from '../src/marketplace.ts'
import { createCommunityServer } from '../src/party.ts'

test('marketplace creator, submission, review and download workflows', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'laap-marketplace-test-'))
  const database = join(directory, 'marketplace.sqlite')
  const store = new MarketplaceStore(database)
  const origins = new Set(['http://tauri.localhost'])
  const relay = createCommunityServer({ origins, marketplace: store.handler(origins) })
  relay.server.listen(0, '127.0.0.1')
  await once(relay.server, 'listening')
  const address = relay.server.address()
  assert(address && typeof address !== 'string')
  const base = 'http://127.0.0.1:' + address.port

  const pkgHash = 'b'.repeat(64)

  try {
    // 1. Create a creator profile
    const creatorResp = await fetch(base + '/v1/marketplace/creator', {
      method: 'POST',
      headers: { origin: 'http://tauri.localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'HextechArtisan', bio: 'Custom LoL Skin Creator', contact: '@artisan' }),
    })
    assert.equal(creatorResp.status, 200)
    const creator = await creatorResp.json() as { id: string; displayName: string }
    assert.equal(creator.displayName, 'HextechArtisan')
    assert(creator.id)

    // 2. Submit a mod package
    const submitResp = await fetch(base + '/v1/marketplace/submit', {
      method: 'POST',
      headers: { origin: 'http://tauri.localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creatorId: creator.id,
        packageHash: pkgHash,
        title: 'Cyberpunk Ahri',
        description: 'Neon foxfire visual overhaul with custom particle textures.',
        champion: 'Ahri',
        version: '1.2.0',
        tags: ['Sci-Fi', 'VFX', 'Audio'],
        rightsConfirmed: true,
      }),
    })
    assert.equal(submitResp.status, 200)
    const submission = await submitResp.json() as { id: string; packageHash: string; status: string }
    assert.equal(submission.packageHash, pkgHash)
    assert.equal(submission.status, 'approved')

    // 3. Reject submission without rights confirmation
    const invalidSubmit = await fetch(base + '/v1/marketplace/submit', {
      method: 'POST',
      headers: { origin: 'http://tauri.localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creatorId: creator.id,
        packageHash: 'c'.repeat(64),
        title: 'Unlicensed Skin',
        rightsConfirmed: false,
      }),
    })
    assert.equal(invalidSubmit.status, 400)

    // 4. Record downloads
    const dlResp1 = await fetch(base + '/v1/marketplace/download/' + pkgHash, {
      method: 'POST',
      headers: { origin: 'http://tauri.localhost' },
    })
    assert.equal(dlResp1.status, 200)
    const dl1 = await dlResp1.json() as { count: number }
    assert.equal(dl1.count, 1)

    const dlResp2 = await fetch(base + '/v1/marketplace/download/' + pkgHash, {
      method: 'POST',
      headers: { origin: 'http://tauri.localhost' },
    })
    const dl2 = await dlResp2.json() as { count: number }
    assert.equal(dl2.count, 2)

    // 5. Submit reviews
    const revResp1 = await fetch(base + '/v1/marketplace/review', {
      method: 'POST',
      headers: { origin: 'http://tauri.localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        packageHash: pkgHash,
        author: 'PlayerOne',
        rating: 5,
        comment: 'Incredible texture work and sound effects!',
      }),
    })
    assert.equal(revResp1.status, 200)

    const revResp2 = await fetch(base + '/v1/marketplace/review', {
      method: 'POST',
      headers: { origin: 'http://tauri.localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        packageHash: pkgHash,
        author: 'PlayerTwo',
        rating: 4,
        comment: 'Looks great in-game, minor clipping on recall.',
      }),
    })
    assert.equal(revResp2.status, 200)

    // 6. Query reviews list
    const listReviewsResp = await fetch(base + '/v1/marketplace/reviews/' + pkgHash, {
      headers: { origin: 'http://tauri.localhost' },
    })
    assert.equal(listReviewsResp.status, 200)
    const reviews = await listReviewsResp.json() as Array<{ author: string; rating: number; comment: string }>
    assert.equal(reviews.length, 2)
    assert.equal(reviews[0].rating, 4) // most recent first
    assert.equal(reviews[1].rating, 5)

    // 7. Query mod catalog
    const modsResp = await fetch(base + '/v1/marketplace/mods', {
      headers: { origin: 'http://tauri.localhost' },
    })
    assert.equal(modsResp.status, 200)
    const mods = await modsResp.json() as Array<{
      packageHash: string
      title: string
      creatorName: string
      averageRating: number
      downloadCount: number
      reviewCount: number
      tags: string[]
    }>
    assert.equal(mods.length, 1)
    assert.equal(mods[0].packageHash, pkgHash)
    assert.equal(mods[0].title, 'Cyberpunk Ahri')
    assert.equal(mods[0].creatorName, 'HextechArtisan')
    assert.equal(mods[0].downloadCount, 2)
    assert.equal(mods[0].reviewCount, 2)
    assert.equal(mods[0].averageRating, 4.5) // (5 + 4) / 2 = 4.5
    assert.deepEqual(mods[0].tags, ['Sci-Fi', 'VFX', 'Audio'])
  } finally {
    await relay.close()
    store.close()
    await rm(directory, { recursive: true, force: true })
  }
})
