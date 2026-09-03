import type { AppDatabase } from '../db/database.js'
import type { LaapServicePort } from './service-port.js'
import { SqliteAuthService } from './sqlite/auth.service.js'
import { SqliteAccountService } from './sqlite/account.service.js'
import { SqliteLeaseService } from './sqlite/lease.service.js'
import { SqliteDeviceService } from './sqlite/device.service.js'
import { SqliteAdminService } from './sqlite/admin.service.js'

export class LaapService implements LaapServicePort {
  public readonly auth: SqliteAuthService
  public readonly accounts: SqliteAccountService
  public readonly leases: SqliteLeaseService
  public readonly devices: SqliteDeviceService
  public readonly admin: SqliteAdminService

  constructor(private readonly database: AppDatabase) {
    const addAuditFn = (
      actorId: string,
      action: string,
      entityType: string,
      entityId: string,
      payload: Record<string, unknown>
    ) => {
      this.admin.addAudit(actorId, action, entityType, entityId, payload)
    }

    this.auth = new SqliteAuthService(this.database, addAuditFn)
    this.accounts = new SqliteAccountService(this.database, addAuditFn)
    this.leases = new SqliteLeaseService(this.database, addAuditFn)
    this.devices = new SqliteDeviceService(this.database, addAuditFn)
    this.admin = new SqliteAdminService(this.database, this.auth, this.accounts, this.leases)
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
  reapStaleSessions = (persist?: boolean) => this.leases.reapStaleSessions(persist)

  // Device delegation
  listDevices = (userId?: string) => this.devices.listDevices(userId)
  registerDevice = (userId: string, input: any) => this.devices.registerDevice(userId, input)
  revokeDevice = (actorId: string, deviceId: string) => this.devices.revokeDevice(actorId, deviceId)
  verifyDeviceChallenge = (userId: string, deviceId: string, accountId: string, nonce: string, sig: string) =>
    this.devices.verifyDeviceChallenge(userId, deviceId, accountId, nonce, sig)

  // Admin & Analytics delegation
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
