import { strict as assert } from 'node:assert'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { MarketplaceStore } from '../src/marketplace.ts'
import { validatePackage } from '../src/packageValidation.ts'
import { createCommunityServer } from '../src/party.ts'
import { packageFixture } from './packageFixture.ts'

test('marketplace authenticated upload → moderation → verified bytes, ownership, reviews and persistent takedown', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'laap-marketplace-'))
  const database = join(directory, 'marketplace.sqlite'); const adminKey = randomBytes(32).toString('hex')
  const store = new MarketplaceStore(database, { adminKey }); const origins = new Set(['http://tauri.localhost'])
  const relay = createCommunityServer({ origins, marketplace: store.handler(origins) })
  relay.server.listen(0,'127.0.0.1'); await once(relay.server,'listening')
  const address = relay.server.address(); assert(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}/v1/marketplace`
  const request = (path: string, data?: unknown, token?: string, admin?: string, method?: string) => fetch(base+path,{ method:method ?? (data === undefined?'GET':'POST'),headers:{origin:'http://tauri.localhost','Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...(admin?{'X-Admin-Key':admin}:{})},body:data === undefined?undefined:JSON.stringify(data) })
  const register = async (name: string) => { const r = await request('/creator',{displayName:name}); assert.equal(r.status,200); return r.json() as Promise<{id:string;authToken:string}> }
  const fixture = packageFixture(); const hash = fixture.packageHash
  try {
    const creator = await register('Original artist'); const other = await register('Independent reviewer')
    const data = {...fixture,archive:undefined,creatorId:creator.id,title:'Original CC0 package',rightsConfirmed:true}
    assert.equal((await request('/submit', data)).status,401)
    assert.equal((await request('/submit',{...data,archiveBase64:undefined},creator.authToken)).status,400)
    assert.equal((await request('/submit',{...data,rightsConfirmed:'yes'},creator.authToken)).status,403)
    assert.equal((await request('/submit',data,creator.authToken)).status,200)
    assert.deepEqual(await (await request('/mods')).json(),[])
    assert.equal((await request('/mods?status=pending_review')).status,401)
    assert.equal((await request('/mods?status=pending_review',undefined,undefined,'community-admin-key-laap-2026')).status,401)
    assert.equal((await request(`/mods/${hash}/download`)).status,404)
    assert.equal((await request('/submit',{...data,creatorId:other.id},other.authToken)).status,403)
    assert.equal((await request('/creator',{id:creator.id,displayName:'Hijack'},other.authToken)).status,403)
    const review = {packageHash:hash,rating:5,comment:'Original content'}
    assert.equal((await request('/review',review,other.authToken)).status,404)
    assert.equal((await request(`/admin/review/${hash}`,{action:'approve',note:'Reviewed'})).status,401)
    assert.equal((await request(`/admin/review/${hash}`,{action:'approve',note:'Reviewed rights and contents'},undefined,adminKey)).status,200)
    const publicRows = await (await request('/mods')).json() as object[]; assert.equal(publicRows.length,1); assert(!JSON.stringify(publicRows).includes(creator.authToken))
    const download = await request(`/mods/${hash}/download`); assert.equal(download.status,200); assert.deepEqual(Buffer.from(await download.arrayBuffer()),fixture.archive)
    assert.equal((await request('/review',review,creator.authToken)).status,400)
    const concurrent = await Promise.all([request('/review',review,other.authToken),request('/review',{...review,rating:4},other.authToken)])
    assert(concurrent.every(r=>r.status===200)); assert.equal((await (await request(`/reviews/${hash}`)).json()).length,1)
    assert.equal((await request('/review',review,other.authToken,undefined,'DELETE')).status,200)
    assert.equal((await (await request(`/reviews/${hash}`)).json()).length,0)
    assert.equal((await request(`/admin/review/${hash}`,{action:'takedown',note:'Rights complaint'},undefined,adminKey)).status,200)
    assert.equal((await request(`/mods/${hash}/download`)).status,404)
    assert.equal((await request('/submit',data,creator.authToken)).status,409)
    assert.equal((await request(`/admin/review/${hash}`,{action:'approve',note:'Invalid restore'},undefined,adminKey)).status,409)
    assert.equal((await request(`/admin/review/${hash}`,{action:'restore',note:'Appeal upheld; new review required'},undefined,adminKey)).status,200)
    assert.equal((await request('/admin/audit',undefined,undefined,adminKey)).status,200)
    assert.equal((await request('/my-submissions',undefined,creator.authToken)).status,200)
    const malformed = await fetch(base+'/creator',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}); assert.equal(malformed.status,400)
    const oversized = await request('/creator',{displayName:'x'.repeat(9000)}); assert.equal(oversized.status,413)
  } finally { await relay.close(); store.close() }
  const restarted = new MarketplaceStore(database)
  try { assert.equal((restarted.database.prepare('SELECT status FROM submissions WHERE package_hash=?').get(hash) as {status:string}).status,'pending_review'); assert.equal((restarted.database.prepare('SELECT COUNT(*) AS n FROM marketplace_audit').get() as {n:number}).n,3) }
  finally { restarted.close(); await rm(directory,{recursive:true,force:true}) }
})

test('marketplace admin fails closed when missing or weak; request quotas apply', async () => {
  const store = new MarketplaceStore(':memory:',{adminKey:'weak'})
  const origins = new Set<string>(); const relay = createCommunityServer({origins,marketplace:store.handler(origins)})
  relay.server.listen(0,'127.0.0.1'); await once(relay.server,'listening'); const a = relay.server.address(); assert(a && typeof a !== 'string')
  const base = `http://127.0.0.1:${a.port}/v1/marketplace/mods?status=pending_review`
  try {
    assert.equal((await fetch(base,{headers:{'X-Admin-Key':'weak'}})).status,401)
    let last=0; for(let i=0;i<181;i++) { const r=await fetch(base); last=r.status; await r.text() }
    assert.equal(last,429)
  } finally { await relay.close(); store.close() }
})

test('archive parser rejects truncation, traversal, duplicate, disguised executable and corrupt entry hashes', async () => {
  const f=packageFixture(); await validatePackage(f.archive,f.manifest)
  await assert.rejects(validatePackage(f.archive.subarray(0,-5),f.manifest))
  for (const names of [['../escape.txt'],['a.txt','A.txt'],['CON.txt'],['folder/script.exe']]) {
    const bad=packageFixture(names.map(name=>({name,bytes:Buffer.from('original data')})))
    await assert.rejects(validatePackage(bad.archive,bad.manifest))
  }
  const executable=packageFixture([{name:'payload.bin',bytes:Buffer.from('MZfake executable')}]); await assert.rejects(validatePackage(executable.archive,executable.manifest))
  const wrong=structuredClone(f.manifest); wrong.files[0].sha256='f'.repeat(64); await assert.rejects(validatePackage(f.archive,wrong))
})
