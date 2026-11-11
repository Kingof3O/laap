import { strict as assert } from 'node:assert'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { test } from 'node:test'
import { MarketplaceStore } from '../src/marketplace.ts'
import { createCommunityServer } from '../src/party.ts'

test('marketplace creator, submission, review and download workflows with authentication and moderation', async () => {
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
    // 1. Create a creator profile (returns authToken)
    const creatorResp = await fetch(base + '/v1/marketplace/creator', {
      method: 'POST',
      headers: { origin: 'http://tauri.localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'HextechArtisan', bio: 'Custom LoL Skin Creator', contact: '@artisan' }),
    })
    assert.equal(creatorResp.status, 200)
    const creator = await creatorResp.json() as { id: string; displayName: string; authToken: string }
    assert.equal(creator.displayName, 'HextechArtisan')
    assert(creator.id)
    assert(creator.authToken)

    // 2. Unauthenticated submission fails with 401
    const unauthSubmit = await fetch(base + '/v1/marketplace/submit', {
      method: 'POST',
      headers: { origin: 'http://tauri.localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creatorId: creator.id,
        packageHash: pkgHash,
        title: 'Cyberpunk Ahri',
        rightsConfirmed: true,
      }),
    })
    assert.equal(unauthSubmit.status, 401)

    // 3. Authenticated submit puts mod into 'pending_review'
    const submitResp = await fetch(base + '/v1/marketplace/submit', {
      method: 'POST',
      headers: {
        origin: 'http://tauri.localhost',
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + creator.authToken,
      },
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
    assert.equal(submission.status, 'pending_review')

    // 4. Mod is not visible to public before moderation approval
    const publicList1 = await fetch(base + '/v1/marketplace/mods', {
      headers: { origin: 'http://tauri.localhost' },
    })
    const modsBefore = await publicList1.json() as unknown[]
    assert.equal(modsBefore.length, 0)

    // 5. Admin approves the mod
    const adminApprove = await fetch(base + '/v1/marketplace/admin/review/' + pkgHash, {
      method: 'POST',
      headers: {
        origin: 'http://tauri.localhost',
        'Content-Type': 'application/json',
        'X-Admin-Key': 'community-admin-key-laap-2026',
      },
      body: JSON.stringify({ action: 'approve', note: 'Quality textures verified.' }),
    })
    assert.equal(adminApprove.status, 200)

    // 6. Public catalog now includes approved mod
    const publicList2 = await fetch(base + '/v1/marketplace/mods', {
      headers: { origin: 'http://tauri.localhost' },
    })
    const modsAfter = await publicList2.json() as Array<{ packageHash: string; title: string }>
    assert.equal(modsAfter.length, 1)
    assert.equal(modsAfter[0].packageHash, pkgHash)

    // 7. Record downloads
    const dlResp = await fetch(base + '/v1/marketplace/download/' + pkgHash, {
      method: 'POST',
      headers: { origin: 'http://tauri.localhost' },
    })
    assert.equal(dlResp.status, 200)
    const dl = await dlResp.json() as { count: number }
    assert.equal(dl.count, 1)

    // 8. Creator cannot review their own package
    const selfReview = await fetch(base + '/v1/marketplace/review', {
      method: 'POST',
      headers: {
        origin: 'http://tauri.localhost',
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + creator.authToken,
      },
      body: JSON.stringify({
        packageHash: pkgHash,
        rating: 5,
        comment: 'I made this, it is great!',
      }),
    })
    assert.equal(selfReview.status, 400)

    // 9. Independent reviewer registers and posts review
    const reviewerResp = await fetch(base + '/v1/marketplace/creator', {
      method: 'POST',
      headers: { origin: 'http://tauri.localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'PlayerTwo', bio: 'Mod Reviewer', contact: '@reviewer' }),
    })
    const reviewer = await reviewerResp.json() as { id: string; authToken: string }

    const revResp = await fetch(base + '/v1/marketplace/review', {
      method: 'POST',
      headers: {
        origin: 'http://tauri.localhost',
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + reviewer.authToken,
      },
      body: JSON.stringify({
        packageHash: pkgHash,
        rating: 5,
        comment: 'Incredible texture work and sound effects!',
      }),
    })
    assert.equal(revResp.status, 200)

    // 10. Duplicate review rejected
    const dupReview = await fetch(base + '/v1/marketplace/review', {
      method: 'POST',
      headers: {
        origin: 'http://tauri.localhost',
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + reviewer.authToken,
      },
      body: JSON.stringify({
        packageHash: pkgHash,
        rating: 4,
        comment: 'Posting another review',
      }),
    })
    assert.equal(dupReview.status, 400)
  } finally {
    relay.server.close()
    store.close()
  }
})
