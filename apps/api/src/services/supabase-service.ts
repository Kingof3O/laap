import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { LaapServicePort } from './service-port.js'
import { SupabaseAuthService } from './supabase/auth.service.js'
import { SupabaseAccountService } from './supabase/account.service.js'
import { SupabaseLeaseService } from './supabase/lease.service.js'
import { SupabaseDeviceService } from './supabase/device.service.js'
import { SupabaseAdminService } from './supabase/admin.service.js'

export type SupabaseRuntime = { url: string; anonKey: string; serviceRoleKey: string }

export class SupabaseLaapService implements LaapServicePort {
  private readonly data: SupabaseClient
  private readonly authClient: SupabaseClient

  public readonly auth: SupabaseAuthService
  public readonly accounts: SupabaseAccountService
  public readonly leases: SupabaseLeaseService
  public readonly devices: SupabaseDeviceService
  public readonly admin: SupabaseAdminService

  constructor(runtime: SupabaseRuntime) {
    this.data = createClient(runtime.url, runtime.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    this.authClient = createClient(runtime.url, runtime.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    this.auth = new SupabaseAuthService(this.data, this.authClient)
    this.accounts = new SupabaseAccountService(this.data)
    this.leases = new SupabaseLeaseService(this.data)
    this.devices = new SupabaseDeviceService(this.data)
    this.admin = new SupabaseAdminService(this.data, this.auth, this.accounts, this.leases)
  }

  serviceClient() {
    return this.data
  }

  // Auth delegation
  findUserByEmail = (email: string) => this.auth.findUserByEmail(email)
  findUserById = (id: string) => this.auth.findUserById(id)
  authenticate = (email: string, pass: string) => this.auth.authenticate(email, pass)
  listUsers = () => this.auth.listUsers()
  createUser = (actorId: string, input: any) => this.auth.createUser(actorId, input)

  // Account delegation
  listAccounts = (userId?: string) => this.accounts.listAccounts(userId)
  createAccount = (actorId: string, input: any) => this.accounts.createAccount(actorId, input)
  updateAccount = (actorId: string, accountId: string, input: any) => this.accounts.updateAccount(actorId, accountId, input)
  deleteAccount = (actorId: string, accountId: string) => this.accounts.deleteAccount(actorId, accountId)
  saveAccountSessionBlob = (actorId: string, accountId: string, blob: string) => this.accounts.saveAccountSessionBlob(actorId, accountId, blob)
  getAccountSessionBlob = (userId: string, sessionId: string) => this.accounts.getAccountSessionBlob(userId, sessionId)
  deleteAccountSessionBlob = (actorId: string, accountId: string) => this.accounts.deleteAccountSessionBlob(actorId, accountId)

  // Lease delegation
  acquireLease = (userId: string, accountId: string, deviceId: string, options?: any) => this.leases.acquireLease(userId, accountId, deviceId, options)
  releaseLease = (actor: any, sessionId: string, reason: string) => this.leases.releaseLease(actor, sessionId, reason)
  forceReleaseAccount = (actor: any, accountId: string) => this.leases.forceReleaseAccount(actor, accountId)
  reapStaleSessions = () => this.leases.reapStaleSessions()

  // Device delegation
  listDevices = (userId?: string) => this.devices.listDevices(userId)
  registerDevice = (userId: string, input: any) => this.devices.registerDevice(userId, input)
  revokeDevice = (actorId: string, deviceId: string) => this.devices.revokeDevice(actorId, deviceId)
  verifyDeviceChallenge = (userId: string, deviceId: string, accountId: string, nonce: string, sig: string) =>
    this.devices.verifyDeviceChallenge(userId, deviceId, accountId, nonce, sig)

  // Admin delegation
  listAssignments = () => this.admin.listAssignments()
  addAssignment = (actorId: string, accountId: string, userId: string, exp: any) => this.admin.addAssignment(actorId, accountId, userId, exp)
  revokeAssignment = (actorId: string, accountId: string, userId: string) => this.admin.revokeAssignment(actorId, accountId, userId)
  listAudit = (limit?: number, offset?: number) => this.admin.listAudit(limit, offset)
  recordAudit = (actorId: string, action: string, entityType: string, entityId: string, payload: any) =>
    this.admin.recordAudit(actorId, action, entityType, entityId, payload)
  getDashboard = (userId: string) => this.admin.getDashboard(userId)
  getMetrics = (userId?: string) => this.admin.getMetrics(userId)
  listSessions = (userId?: string) => this.admin.listSessions(userId)
  listActivity = (userId?: string) => this.admin.listActivity(userId)
}
