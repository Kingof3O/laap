import type { DashboardAccount } from '@laap/types'
import type { MaybePromise } from '../service-port.js'

export interface IAccountService {
  listAccounts(userId?: string): MaybePromise<DashboardAccount[]>
  createAccount(
    actorId: string,
    input: { displayName: string; externalId: string; region: string; status: 'available' | 'maintenance' | 'disabled' }
  ): MaybePromise<string>
  updateAccount(
    actorId: string,
    accountId: string,
    input: Partial<{ displayName: string; externalId: string; region: string; status: 'available' | 'maintenance' | 'disabled' }>
  ): MaybePromise<void>
  deleteAccount(actorId: string, accountId: string): MaybePromise<void>
  saveAccountSessionBlob(actorId: string, accountId: string, sessionBlob: string): MaybePromise<void>
  getAccountSessionBlob(userId: string, sessionId: string): MaybePromise<string>
  deleteAccountSessionBlob(actorId: string, accountId: string): MaybePromise<void>
}
