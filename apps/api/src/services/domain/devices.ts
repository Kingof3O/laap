import type { DeviceView, MaybePromise } from '../service-port.js'

export interface IDeviceService {
  listDevices(userId?: string): MaybePromise<DeviceView[]>
  registerDevice(
    userId: string,
    input: { publicKey: string; platform: 'windows' | 'macos'; deviceName: string; appVersion: string }
  ): MaybePromise<string>
  revokeDevice(actorId: string, deviceId: string): MaybePromise<void>
  approveDevice(actorId: string, deviceId: string): MaybePromise<void>
  touchDevice(userId: string, deviceId: string, appVersion?: string): MaybePromise<void>
  verifyDeviceChallenge(
    userId: string,
    deviceId: string,
    accountId: string,
    nonce: string,
    signature: string
  ): MaybePromise<boolean>
}
