import { createPublicKey, verify as verifySignature } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DeviceView } from '../service-port.js'
import { ServiceError } from '../service-error.js'
import type { IDeviceService } from '../domain/devices.js'
import { executeQuery, type Row } from './shared.js'

export class SupabaseDeviceService implements IDeviceService {
  constructor(private readonly data: SupabaseClient) {}

  async listDevices(userId?: string) {
    let query = this.data.from('user_devices').select('id,user_id,public_key,platform,device_name,app_version,status,last_seen_at,profiles(display_name)')
    if (userId) query = query.eq('user_id', userId)
    const rows = await executeQuery<Row[]>(query.order('last_seen_at', { ascending: false }), 'DEVICES_LOOKUP_FAILED')
    return rows.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      deviceName: String(row.device_name),
      platform: String(row.platform),
      appVersion: String(row.app_version),
      status: String(row.status),
      lastSeenAt: String(row.last_seen_at),
      user: String((row.profiles as Row | undefined)?.display_name ?? 'Unknown'),
      publicKeyPresent: Boolean(row.public_key),
    })) satisfies DeviceView[]
  }

  async registerDevice(
    userId: string,
    input: { publicKey: string; platform: 'windows' | 'macos'; deviceName: string; appVersion: string }
  ) {
    const existing = await executeQuery<Row | null>(
      this.data.from('user_devices').select('id').eq('user_id', userId).eq('public_key', input.publicKey).maybeSingle()
    )
    if (existing) {
      await executeQuery(
        this.data
          .from('user_devices')
          .update({ device_name: input.deviceName, app_version: input.appVersion, status: 'active', last_seen_at: new Date().toISOString() })
          .eq('id', existing.id),
        'DEVICE_UPDATE_FAILED'
      )
      return String(existing.id)
    }
    const inserted = await executeQuery<Row>(
      this.data
        .from('user_devices')
        .insert({
          user_id: userId,
          public_key: input.publicKey,
          platform: input.platform,
          device_name: input.deviceName,
          app_version: input.appVersion,
          status: 'active',
          last_seen_at: new Date().toISOString(),
        })
        .select('id')
        .single(),
      'DEVICE_REGISTER_FAILED'
    )
    return String(inserted.id)
  }

  async revokeDevice(_actorId: string, deviceId: string) {
    await executeQuery(this.data.from('user_devices').update({ status: 'revoked' }).eq('id', deviceId), 'DEVICE_REVOKE_FAILED')
  }

  async verifyDeviceChallenge(userId: string, deviceId: string, accountId: string, nonce: string, signature: string) {
    const [timestampText, nonceAccountId] = nonce.split(':', 2)
    const timestamp = Number(timestampText)
    if (!Number.isFinite(timestamp) || nonceAccountId !== accountId || Math.abs(Date.now() - timestamp) > 5 * 60_000) return false
    const device = await executeQuery<Row | null>(
      this.data.from('user_devices').select('public_key').eq('id', deviceId).eq('user_id', userId).eq('status', 'active').maybeSingle()
    )
    if (!device?.public_key) return false
    try {
      const rawPublicKey = Buffer.from(String(device.public_key), 'base64')
      const rawSignature = Buffer.from(signature, 'base64')
      if (rawPublicKey.length !== 32 || rawSignature.length !== 64) return false
      const publicKey = createPublicKey({
        key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), rawPublicKey]),
        format: 'der',
        type: 'spki',
      })
      return verifySignature(null, Buffer.from(nonce), publicKey, rawSignature)
    } catch {
      return false
    }
  }
}
