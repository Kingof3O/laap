import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, createSupabaseApp, type AppHandle } from '../server.js'

let app: AppHandle | undefined

afterEach(async () => {
  if (app) await app.close()
  app = undefined
})

async function createTestApp() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'laap-test-'))
  app = await createApp({ dataDir: path.join(directory, 'laap.sqlite'), jwtSecret: 'test-secret-that-is-long-enough-for-jwt-signing', vaultKey: 'test-vault-key-that-is-long-enough', adminPassword: 'ChangeMe!2026', enableDemoAuth: true, allowedOrigin: 'http://localhost:5173', logRequests: false })
  return app
}

describe('LAAP lease service', () => {
  it('serializes competing claims for a single account', async () => {
    const instance = await createTestApp()
    const users = await instance.service.listUsers()
    const maya = users.find((user) => user.email === 'maya@laap.local')!
    const admin = users.find((user) => user.email === 'admin@laap.local')!
    const nova = (await instance.service.listAccounts()).find((account) => account.name === 'Nova#EUW')!
    const devices = await instance.service.listDevices()
    const mayaDevice = devices.find((device) => device.userId === maya.id)!
    const adminDevice = devices.find((device) => device.userId === admin.id)!

    // The seeded Nova session is released before testing the race.
    const current = (await instance.service.listSessions()).find((session) => session.account === 'Nova#EUW')!
    await instance.service.releaseLease(admin, current.id, 'manual')

    const results = await Promise.allSettled([
      instance.service.acquireLease(maya.id, nova.id, mayaDevice.id),
      instance.service.acquireLease(admin.id, nova.id, adminDevice.id),
    ])
    const fulfilled = results.filter((result): result is PromiseFulfilledResult<{ success: true; sessionId: string; isReconnect: boolean }> => result.status === 'fulfilled')
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0].reason as Error).message).toBe('ACCOUNT_BUSY')
  })

  it('allows an owner/device reconnect and records release audit events', async () => {
    const instance = await createTestApp()
    const maya = (await instance.service.listUsers()).find((user) => user.email === 'maya@laap.local')!
    const account = (await instance.service.listAccounts()).find((row) => row.name === 'Nova#EUW')!
    const device = (await instance.service.listDevices()).find((row) => row.userId === maya.id)!
    const seeded = (await instance.service.listSessions()).find((session) => session.account === 'Nova#EUW')!
    const seededOwner = await instance.service.findUserById(seeded.user === maya.displayName ? maya.id : (await instance.service.listUsers()).find((user) => user.role === 'admin')!.id)
    await instance.service.releaseLease(seededOwner!, seeded.id, 'manual')
    const first = await instance.service.acquireLease(maya.id, account.id, device.id)
    const reconnect = await instance.service.acquireLease(maya.id, account.id, device.id)
    expect(first.isReconnect).toBe(false)
    expect(reconnect).toEqual({ success: true, sessionId: first.sessionId, isReconnect: true })
    await instance.service.releaseLease(maya, first.sessionId, 'manual')
    expect((await instance.service.listAudit(10)).some((entry) => entry.action === 'SESSION_ENDED')).toBe(true)
  })

  it('protects the dashboard behind an http-only authenticated session', async () => {
    const instance = await createTestApp()
    await new Promise<void>((resolve) => instance.server.listen(0, '127.0.0.1', () => resolve()))
    const address = instance.server.address() as AddressInfo
    const baseUrl = `http://127.0.0.1:${address.port}`
    const denied = await fetch(`${baseUrl}/api/dashboard`)
    expect(denied.status).toBe(401)
    const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@laap.local', password: 'ChangeMe!2026' }) })
    expect(login.status).toBe(200)
    const cookie = login.headers.get('set-cookie')?.split(';')[0]
    expect(cookie).toMatch(/^laap_access=/)
    expect((await login.clone().json() as { accessToken?: string }).accessToken).toBeUndefined()
    const tauriLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://tauri.localhost' }, body: JSON.stringify({ email: 'admin@laap.local', password: 'ChangeMe!2026' }) })
    const tauriLoginPayload = await tauriLogin.json() as { accessToken?: string }
    expect(tauriLoginPayload.accessToken).toEqual(expect.any(String))
    expect(tauriLogin.headers.get('access-control-allow-origin')).toBe('https://tauri.localhost')
    expect(tauriLogin.headers.get('set-cookie')).toBeNull()
    const spoofedTauriLogin = await fetch(`${baseUrl}/api/auth/login?client=tauri`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@laap.local', password: 'ChangeMe!2026' }) })
    expect((await spoofedTauriLogin.json() as { accessToken?: string }).accessToken).toBeUndefined()
    const dashboard = await fetch(`${baseUrl}/api/dashboard`, { headers: { cookie: cookie! } })
    expect(dashboard.status).toBe(200)
    const payload = await dashboard.json() as { metrics: { totalAccounts: number } }
    expect(payload.metrics.totalAccounts).toBe(55)
    const firstAuditPage = await fetch(`${baseUrl}/api/audit?limit=1&offset=0`, { headers: { cookie: cookie! } })
    expect(firstAuditPage.status).toBe(200)
    const firstAuditPayload = await firstAuditPage.json() as { audit: Array<{ id: string }>; pagination: { limit: number; offset: number; hasMore: boolean } }
    expect(firstAuditPayload.audit).toHaveLength(1)
    expect(firstAuditPayload.pagination).toMatchObject({ limit: 1, offset: 0, hasMore: true })
    const secondAuditPage = await fetch(`${baseUrl}/api/audit?limit=1&offset=1`, { headers: { cookie: cookie! } })
    const secondAuditPayload = await secondAuditPage.json() as { audit: Array<{ id: string }>; pagination: { limit: number; offset: number; hasMore: boolean } }
    expect(secondAuditPayload.audit).toHaveLength(1)
    expect(secondAuditPayload.pagination.offset).toBe(1)
    expect(secondAuditPayload.audit[0].id).not.toBe(firstAuditPayload.audit[0].id)
    const createUser = await fetch(`${baseUrl}/api/users`, { method: 'POST', headers: { cookie: cookie!, 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'New Operator', email: 'new-operator@example.com', password: 'LongEnoughPassword!2026', role: 'operator' }) })
    expect(createUser.status).toBe(201)
    expect((await createUser.json() as { user: { email: string; role: string } }).user).toMatchObject({ email: 'new-operator@example.com', role: 'operator' })
    const account = (await instance.service.listAccounts())[0]
    const credentialWrite = await fetch(`${baseUrl}/api/accounts/${account.id}/credentials`, { method: 'POST', headers: { cookie: cookie!, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'riot-user', password: 'not-returned-to-browser' }) })
    expect(credentialWrite.status).toBe(410)
    const credentialStatus = await fetch(`${baseUrl}/api/accounts/${account.id}/credential-status`, { headers: { cookie: cookie! } })
    expect(credentialStatus.status).toBe(410)
    const operatorLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'maya@laap.local', password: 'ChangeMe!2026' }) })
    const operatorCookie = operatorLogin.headers.get('set-cookie')?.split(';')[0]
    const operatorCredentialWrite = await fetch(`${baseUrl}/api/accounts/${account.id}/credentials`, { method: 'POST', headers: { cookie: operatorCookie!, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'operator-must-not-write', password: 'blocked' }) })
    expect(operatorCredentialWrite.status).toBe(410)
    const freeAccount = (await instance.service.listAccounts()).find((row) => row.name === 'Lumen#EUNE')!
    const adminDevice = (await instance.service.listDevices()).find((row) => row.user === 'Alex Kim')!
    const acquire = await fetch(`${baseUrl}/api/leases/acquire`, { method: 'POST', headers: { cookie: cookie!, 'content-type': 'application/json' }, body: JSON.stringify({ accountId: freeAccount.id, deviceId: adminDevice.id }) })
    expect(acquire.status).toBe(200)
    const acquirePayload = await acquire.json() as { success: boolean; sessionId: string }
    expect(acquirePayload.success).toBe(true)
    const heartbeat = await fetch(`${baseUrl}/api/leases/${acquirePayload.sessionId}/heartbeat`, { method: 'POST', headers: { cookie: cookie!, 'content-type': 'application/json' }, body: JSON.stringify({ runtimeState: 'IN_GAME' }) })
    expect(heartbeat.status).toBe(200)
  })

  it('allows acquiring and releasing leases cleanly without heartbeat dependency', async () => {
    const instance = await createTestApp()
    await new Promise<void>((resolve) => instance.server.listen(0, '127.0.0.1', () => resolve()))
    const address = instance.server.address() as AddressInfo
    const baseUrl = `http://127.0.0.1:${address.port}`
    const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'leo@laap.local', password: 'ChangeMe!2026' }) })
    const cookie = login.headers.get('set-cookie')?.split(';')[0]!
    const session = (await instance.service.listSessions()).find((row) => row.account === 'Orbit#BR1')!
    const release = await fetch(`${baseUrl}/api/leases/${session.id}/release`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'manual' }) })
    expect(release.status).toBe(200)
    expect((await instance.service.listSessions()).find((row) => row.id === session.id)).toBeUndefined()
  })

  it('ends a lease when the desktop reports that Riot and League have exited', async () => {
    const instance = await createTestApp()
    const maya = (await instance.service.listUsers()).find((user) => user.email === 'maya@laap.local')!
    const account = (await instance.service.listAccounts(maya.id)).find((row) => row.name === 'Nova#EUW')!
    const device = (await instance.service.listDevices(maya.id))[0]
    const existing = (await instance.service.listSessions()).find((session) => session.account === 'Nova#EUW')!
    const seededOwner = (await instance.service.listUsers()).find((user) => user.displayName === existing.user)!
    await instance.service.releaseLease(seededOwner, existing.id, 'manual')
    const lease = await instance.service.acquireLease(maya.id, account.id, device.id)
    await instance.service.heartbeatLease(maya.id, lease.sessionId, 'EXITED')
    expect((await instance.service.listSessions()).some((session) => session.id === lease.sessionId)).toBe(false)
    expect((await instance.service.listAudit(20)).some((entry) => entry.entityId === lease.sessionId && entry.action === 'SESSION_ENDED')).toBe(true)
  })

  it('releases a lease when its operator assignment expires during a heartbeat', async () => {
    const instance = await createTestApp()
    const maya = (await instance.service.listUsers()).find((user) => user.email === 'maya@laap.local')!
    const account = (await instance.service.listAccounts(maya.id)).find((row) => row.name === 'Nova#EUW')!
    const device = (await instance.service.listDevices(maya.id))[0]
    const existing = (await instance.service.listSessions()).find((session) => session.account === 'Nova#EUW')!
    const seededOwner = (await instance.service.listUsers()).find((user) => user.displayName === existing.user)!
    await instance.service.releaseLease(seededOwner, existing.id, 'manual')
    const lease = await instance.service.acquireLease(maya.id, account.id, device.id)
    instance.database!.run(
      `UPDATE account_assignments SET expires_at = ? WHERE account_id = ? AND user_id = ?`,
      [new Date(Date.now() - 1_000).toISOString(), account.id, maya.id]
    )
    await expect(instance.service.heartbeatLease(maya.id, lease.sessionId, 'IN_CLIENT')).rejects.toMatchObject({ code: 'ASSIGNMENT_EXPIRED' })
    expect((await instance.service.listSessions()).some((session) => session.id === lease.sessionId)).toBe(false)
  })

  it('does not allow an account to enter maintenance while it is leased', async () => {
    const instance = await createTestApp()
    const admin = (await instance.service.listUsers()).find((user) => user.role === 'admin')!
    const account = (await instance.service.listAccounts()).find((row) => row.name === 'Lumen#EUNE')!
    const device = (await instance.service.listDevices()).find((row) => row.userId === admin.id)!
    const lease = await instance.service.acquireLease(admin.id, account.id, device.id)
    await expect(Promise.resolve().then(() => instance.service.updateAccount(admin.id, account.id, { status: 'maintenance' }))).rejects.toMatchObject({ code: 'ACCOUNT_BUSY' })
    await instance.service.releaseLease(admin, lease.sessionId, 'manual')
    await instance.service.updateAccount(admin.id, account.id, { status: 'maintenance' })
    expect((await instance.service.listAccounts()).find((row) => row.id === account.id)?.status).toBe('Maintenance')
  })

  it('ends active leases when an operator is suspended', async () => {
    const instance = await createTestApp()
    const admin = (await instance.service.listUsers()).find((user) => user.role === 'admin')!
    const maya = (await instance.service.listUsers()).find((user) => user.email === 'maya@laap.local')!
    const account = (await instance.service.listAccounts()).find((row) => row.name === 'Nova#EUW')!
    const seeded = (await instance.service.listSessions()).find((session) => session.account === 'Nova#EUW')!
    const seededOwner = (await instance.service.listUsers()).find((user) => user.displayName === seeded.user)!
    await instance.service.releaseLease(seededOwner, seeded.id, 'manual')
    const device = (await instance.service.listDevices(maya.id))[0]
    const lease = await instance.service.acquireLease(maya.id, account.id, device.id)
    await Promise.resolve().then(() => instance.service.updateUser(admin.id, maya.id, { status: 'suspended' }))
    expect((await instance.service.listSessions()).some((session) => session.id === lease.sessionId)).toBe(false)
  })

  it('requires a signed device challenge in production mode', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'laap-prod-test-'))
    app = await createApp({ dataDir: path.join(directory, 'laap.sqlite'), jwtSecret: 'production-test-secret-that-is-long-enough', vaultKey: 'production-vault-key-that-is-long-enough', adminPassword: 'ProductionPassword!2026', enableDemoAuth: false, nodeEnv: 'production', allowedOrigin: 'http://localhost:5173', logRequests: false })
    await new Promise<void>((resolve) => app!.server.listen(0, '127.0.0.1', () => resolve()))
    const address = app.server.address() as AddressInfo
    const baseUrl = `http://127.0.0.1:${address.port}`
    const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@laap.local', password: 'ProductionPassword!2026' }) })
    const cookie = login.headers.get('set-cookie')?.split(';')[0]!
    expect(cookie).toMatch(/^__Host-laap_access=/)
    const account = (await app.service.listAccounts()).find((row) => row.name === 'Lumen#EUNE')!
    const device = (await app.service.listDevices()).find((row) => row.user === 'Alex Kim')!
    const acquire = await fetch(`${baseUrl}/api/leases/acquire`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ accountId: account.id, deviceId: device.id }) })
    expect(acquire.status).toBe(401)
    const acquirePayload = await acquire.json() as { error: { code: string } }
    expect(acquirePayload.error.code).toBe('DEVICE_SIGNATURE_REQUIRED')
  })

  it('allows admins to save session blobs and allows active lease holders to retrieve them', async () => {
    const instance = await createTestApp()
    await new Promise<void>((resolve) => instance.server.listen(0, '127.0.0.1', () => resolve()))
    const address = instance.server.address() as AddressInfo
    const baseUrl = `http://127.0.0.1:${address.port}`

    // 1. Admin logs in and provisions a session blob for an account
    const adminLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@laap.local', password: 'ChangeMe!2026' }) })
    const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0]!
    const account = (await instance.service.listAccounts()).find((row) => row.name === 'Lumen#EUNE')!

    const sampleYaml = 'riot-client:\n  sessions:\n    league_of_legends.live:\n      remember: true\n      sub: "test-puuid"\n'
    const saveRes = await fetch(`${baseUrl}/api/accounts/${account.id}/session-blob`, {
      method: 'PUT',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionBlob: sampleYaml }),
    })
    expect(saveRes.status).toBe(200)
    const storedSession = instance.database!.get<{ session_blob: string }>('SELECT session_blob FROM accounts WHERE id = ?', [account.id])
    expect(storedSession?.session_blob).toMatch(/^laap:v1:/)
    expect(storedSession?.session_blob).not.toContain('test-puuid')

    // Verify account list now reflects hasSessionBlob = true
    const updatedAccounts = await instance.service.listAccounts()
    expect(updatedAccounts.find((row) => row.id === account.id)?.hasSessionBlob).toBe(true)

    // 2. Operator acquires lease on the account
    const mayaLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'maya@laap.local', password: 'ChangeMe!2026' }) })
    const mayaCookie = mayaLogin.headers.get('set-cookie')?.split(';')[0]!
    const mayaDevice = (await instance.service.listDevices()).find((row) => row.user === 'Maya Chen')!

    // Assign account to Maya first
    await instance.service.addAssignment(
      (await instance.service.findUserByEmail('admin@laap.local'))!.id,
      account.id,
      (await instance.service.findUserByEmail('maya@laap.local'))!.id,
      null,
    )

    const acquireRes = await fetch(`${baseUrl}/api/leases/acquire`, {
      method: 'POST',
      headers: { cookie: mayaCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ accountId: account.id, deviceId: mayaDevice.id }),
    })
    expect(acquireRes.status).toBe(200)
    const { sessionId } = await acquireRes.json() as { sessionId: string }

    // 3. Operator retrieves the session blob
    const getBlobRes = await fetch(`${baseUrl}/api/leases/${sessionId}/session-blob`, {
      headers: { cookie: mayaCookie },
    })
    expect(getBlobRes.status).toBe(200)
    const blobPayload = await getBlobRes.json() as { sessionBlob: string }
    expect(blobPayload.sessionBlob).toBe(sampleYaml)

    // 4. Other users cannot fetch this session blob
    const leoLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'leo@laap.local', password: 'ChangeMe!2026' }) })
    const leoCookie = leoLogin.headers.get('set-cookie')?.split(';')[0]!
    const unauthorizedGet = await fetch(`${baseUrl}/api/leases/${sessionId}/session-blob`, {
      headers: { cookie: leoCookie },
    })
    expect(unauthorizedGet.status).toBe(404)
  })

  it('fails closed when the production Supabase adapter lacks server secrets', async () => {
    await expect(createSupabaseApp({ supabaseUrl: '', supabaseAnonKey: '', supabaseServiceRoleKey: '' })).rejects.toThrow('SUPABASE_URL')
  })
})
