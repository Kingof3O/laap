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
    const dashboard = await fetch(`${baseUrl}/api/dashboard`, { headers: { cookie: cookie! } })
    expect(dashboard.status).toBe(200)
    const payload = await dashboard.json() as { metrics: { totalAccounts: number } }
    expect(payload.metrics.totalAccounts).toBe(55)
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
    expect((await acquire.json() as { success: boolean }).success).toBe(true)
  })

  it('accepts owner heartbeats and transitions a starting session to active', async () => {
    const instance = await createTestApp()
    await new Promise<void>((resolve) => instance.server.listen(0, '127.0.0.1', () => resolve()))
    const address = instance.server.address() as AddressInfo
    const baseUrl = `http://127.0.0.1:${address.port}`
    const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'leo@laap.local', password: 'ChangeMe!2026' }) })
    const cookie = login.headers.get('set-cookie')?.split(';')[0]!
    const session = (await instance.service.listSessions()).find((row) => row.account === 'Orbit#BR1')!
    const heartbeat = await fetch(`${baseUrl}/api/leases/${session.id}/heartbeat`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ runtimeState: 'IN_CLIENT' }) })
    expect(heartbeat.status).toBe(200)
    expect((await instance.service.listSessions()).find((row) => row.id === session.id)?.runtimeState).toBe('IN_CLIENT')
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

  it('fails closed when the production Supabase adapter lacks server secrets', async () => {
    await expect(createSupabaseApp({ supabaseUrl: '', supabaseAnonKey: '', supabaseServiceRoleKey: '' })).rejects.toThrow('SUPABASE_URL')
  })
})
