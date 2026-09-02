import type { ApiUser, DashboardAccount, DashboardActivity, DashboardMetrics, DashboardSession, DashboardSnapshot } from '@laap/types'
import type { IAuthService, IAccountService, ILeaseService, IDeviceService, IAdminService } from './domain/index.js'

export type MaybePromise<T> = T | Promise<T>
export type UserLookup = { id: string; email: string; display_name?: string; role?: ApiUser['role']; status?: ApiUser['status'] }
export type DeviceView = { id: string; userId: string; deviceName: string; platform: string; appVersion: string; status: string; lastSeenAt: string; user: string; publicKeyPresent: boolean }
export type AssignmentView = { id: string; accountId: string; userId: string; account: string; user: string; email: string; status: string; assignedAt: string; expiresAt: string | null }
export type AuditView = { id: string; action: string; entityType: string; entityId: string; payload: Record<string, unknown>; createdAt: string; actor: string }

export interface LaapServicePort
  extends IAuthService,
    IAccountService,
    ILeaseService,
    IDeviceService,
    IAdminService {}

export type {
  IAuthService,
  IAccountService,
  ILeaseService,
  IDeviceService,
  IAdminService,
}
