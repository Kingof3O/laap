import type { ApiUser } from '@laap/types'
import type { MaybePromise, UserLookup } from '../service-port.js'

export interface IAuthService {
  findUserByEmail(email: string): MaybePromise<UserLookup | undefined>
  findUserById(id: string): MaybePromise<ApiUser | undefined>
  authenticate(email: string, password: string): Promise<ApiUser>
  listUsers(): MaybePromise<ApiUser[]>
  createUser(
    actorId: string,
    input: { email: string; displayName: string; password: string; role: 'admin' | 'operator' }
  ): MaybePromise<ApiUser>
  updateUser(actorId: string, userId: string, input: { displayName?: string; role?: 'admin' | 'operator'; status?: ApiUser['status'] }): MaybePromise<ApiUser>
  resetUserPassword(actorId: string, userId: string, password: string): MaybePromise<void>
}
