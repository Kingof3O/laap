import { createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto'
import type { AppDatabase } from '../../db/database.js'
import { ServiceError } from '../service-error.js'
import type { IDeviceService } from '../domain/devices.js'

export class SqliteDeviceService implements IDeviceService {
  constructor(
    private readonly database: AppDatabase,
    private readonly addAuditFn: (actorId: string, action: string, entityType: string, entityId: string, payload: Record<string, unknown>) => void
  ) {}

  listDevices(userId?: string) {
    const query = `
      SELECT d.id, d.user_id, d.public_key, d.platform, d.device_name, d.app_version, d.status, d.last_seen_at, u.display_name AS user_name
      FROM user_devices d
      JOIN users u ON u.id = d.user_id
      ${userId ? 'WHERE d.user_id = ?' : ''}
      ORDER BY d.last_seen_at DESC
    `
    return this.database.all<Record<string, unknown>>(query, userId ? [userId] : []).map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      deviceName: String(row.device_name),
      platform: String(row.platform),
      appVersion: String(row.app_version),
      status: String(row.status),
      lastSeenAt: String(row.last_seen_at),
      user: String(row.user_name),
      publicKeyPresent: Boolean(row.public_key),
    }))
  }

  registerDevice(
    userId: string,
    input: { publicKey: string; platform: 'windows' | 'macos'; deviceName: string; appVersion: string }
  ) {
    return this.database.transactionSync(() => {
      const existing = this.database.get<{ id: string }>(
        'SELECT id FROM user_devices WHERE user_id = ? AND public_key = ?',
        [userId, input.publicKey]
      )
      if (existing) {
        this.database.run(
          `UPDATE user_devices SET device_name = ?, app_version = ?, status = 'active', last_seen_at = ? WHERE id = ?`,
          [input.deviceName, input.appVersion, new Date().toISOString(), existing.id]
        )
        return existing.id
      }
      const id = randomUUID()
      const timestamp = new Date().toISOString()
      this.database.run(
        'INSERT INTO user_devices (id, user_id, public_key, platform, device_name, app_version, status, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, userId, input.publicKey, input.platform, input.deviceName, input.appVersion, 'active', timestamp, timestamp]
      )
      this.addAuditFn(userId, 'DEVICE_REGISTERED', 'user_devices', id, { platform: input.platform })
      return id
    })
  }

  revokeDevice(actorId: string, deviceId: string) {
    this.database.transactionSync(() => {
      if (!this.database.get<{ id: string }>('SELECT id FROM user_devices WHERE id = ?', [deviceId])) {
        throw new ServiceError('DEVICE_NOT_FOUND', 404)
      }
      this.database.run(`UPDATE user_devices SET status = 'revoked' WHERE id = ?`, [deviceId])
      this.addAuditFn(actorId, 'DEVICE_REVOKED', 'user_devices', deviceId, {})
    })
  }

  verifyDeviceChallenge(userId: string, deviceId: string, accountId: string, nonce: string, signature: string) {
    const [timestampText, nonceAccountId] = nonce.split(':', 2)
    const timestamp = Number(timestampText)
    if (!Number.isFinite(timestamp) || nonceAccountId !== accountId || Math.abs(Date.now() - timestamp) > 5 * 60_000) {
      return false
    }
    const device = this.database.get<{ public_key: string }>(
      `SELECT public_key FROM user_devices WHERE id = ? AND user_id = ? AND status = 'active'`,
      [deviceId, userId]
    )
    if (!device) return false
    try {
      const rawPublicKey = Buffer.from(device.public_key, 'base64')
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
