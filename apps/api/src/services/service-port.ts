import type { ApiUser, DashboardAccount, DashboardActivity, DashboardMetrics, DashboardSession, DashboardSnapshot, SessionState } from '@laap/types'

export type MaybePromise<T> = T | Promise<T>
export type UserLookup = { id: string; email: string; display_name?: string; role?: ApiUser['role']; status?: ApiUser['status'] }
export type DeviceView = { id: string; userId: string; deviceName: string; platform: string; appVersion: string; status: string; lastSeenAt: string; user: string; publicKeyPresent: boolean }
export type AssignmentView = { id: string; accountId: string; userId: string; account: string; user: string; email: string; status: string; assignedAt: string; expiresAt: string | null }
export type AuditView = { id: string; action: string; entityType: string; entityId: string; payload: Record<string, unknown>; createdAt: string; actor: string }

export interface LaapServicePort {
  findUserByEmail(email: string): MaybePromise<UserLookup | undefined>
  findUserById(id: string): MaybePromise<ApiUser | undefined>
  authenticate(email: string, password: string): Promise<ApiUser>
  listUsers(): MaybePromise<ApiUser[]>
  createUser(actorId: string, input: { email: string; displayName: string; password: string; role: 'admin' | 'operator' }): MaybePromise<ApiUser>
  listDevices(userId?: string): MaybePromise<DeviceView[]>
  registerDevice(userId: string, input: { publicKey: string; platform: 'windows' | 'macos'; deviceName: string; appVersion: string }): MaybePromise<string>
  revokeDevice(actorId: string, deviceId: string): MaybePromise<void>
  listAccounts(userId?: string): MaybePromise<DashboardAccount[]>
  createAccount(actorId: string, input: { displayName: string; externalId: string; region: string; status: 'available' | 'maintenance' | 'disabled' }): MaybePromise<string>
  updateAccount(actorId: string, accountId: string, input: Partial<{ displayName: string; externalId: string; region: string; status: 'available' | 'maintenance' | 'disabled' }>): MaybePromise<void>
  deleteAccount(actorId: string, accountId: string): MaybePromise<void>
  listAssignments(): MaybePromise<AssignmentView[]>
  addAssignment(actorId: string, accountId: string, userId: string, expiresAt: string | null): MaybePromise<string>
  revokeAssignment(actorId: string, accountId: string, userId: string): MaybePromise<void>
  verifyDeviceChallenge(userId: string, deviceId: string, accountId: string, nonce: string, signature: string): MaybePromise<boolean>
  getDashboard(userId: string): MaybePromise<DashboardSnapshot>
  getMetrics(userId?: string): MaybePromise<DashboardMetrics>
  listSessions(userId?: string): MaybePromise<DashboardSession[]>
  listActivity(userId?: string): MaybePromise<DashboardActivity[]>
  acquireLease(userId: string, accountId: string, deviceId: string, options?: { nonce?: string; signature?: string }): Promise<{ success: true; sessionId: string; isReconnect: boolean }>
  heartbeat(userId: string, sessionId: string, runtimeState: SessionState): MaybePromise<{ success: true; sessionId: string }>
  releaseLease(actor: ApiUser, sessionId: string, reason: string): Promise<{ success: true }>
  listAudit(limit?: number): MaybePromise<AuditView[]>
  recordAudit(actorId: string, action: string, entityType: string, entityId: string, payload: Record<string, unknown>): MaybePromise<void>
  reapStaleSessions(persist?: boolean): MaybePromise<number>
}
