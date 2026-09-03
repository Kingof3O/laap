import type { ApiUser } from '@laap/types'
import type { MaybePromise } from '../service-port.js'

export interface ILeaseService {
  acquireLease(
    userId: string,
    accountId: string,
    deviceId: string,
    options?: { nonce?: string; signature?: string }
  ): Promise<{ success: true; sessionId: string; isReconnect: boolean }>
  releaseLease(actor: ApiUser, sessionId: string, reason: string): Promise<{ success: true }>
  forceReleaseAccount(actor: ApiUser, accountId: string): MaybePromise<{ success: true }>
  reapStaleSessions(persist?: boolean): MaybePromise<number>
}
