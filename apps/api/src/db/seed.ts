import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { AppDatabase } from './database.js'

const now = () => new Date().toISOString()
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

export async function seedDatabase(database: AppDatabase, adminPassword: string) {
  const existing = database.get<{ count: number }>('SELECT COUNT(*) AS count FROM users')
  if (Number(existing?.count ?? 0) > 0) return

  const timestamp = now()
  const adminId = randomUUID()
  const mayaId = randomUUID()
  const jonId = randomUUID()
  const soraId = randomUUID()
  const leoId = randomUUID()
  const passwordHash = await bcrypt.hash(adminPassword, 12)

  database.run('INSERT INTO users (id, email, password_hash, display_name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [adminId, 'admin@laap.local', passwordHash, 'Alex Kim', 'admin', 'active', timestamp, timestamp])
  for (const [id, email, name] of [[mayaId, 'maya@laap.local', 'Maya Chen'], [jonId, 'jon@laap.local', 'Jon Bell'], [soraId, 'sora@laap.local', 'Sora Park'], [leoId, 'leo@laap.local', 'Leo Martins']] as const) {
    database.run('INSERT INTO users (id, email, password_hash, display_name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, email, passwordHash, name, 'operator', 'active', timestamp, timestamp])
  }

  const accountRows = [
    ['Nova#EUW', 'EUW', 'EU West'],
    ['Atlas#NA1', 'NA', 'North America'],
    ['Morrow#KR1', 'KR', 'Korea'],
    ['Orbit#BR1', 'BR', 'Brazil'],
    ['Lumen#EUNE', 'EUNE', 'EU Nordic & East'],
    ['Sable#LAN', 'LAN', 'Latin America North'],
  ] as const
  const accountIds = new Map<string, string>()
  for (const [displayName, region, label] of accountRows) {
    const id = randomUUID()
    accountIds.set(displayName, id)
    database.run('INSERT INTO accounts (id, provider, external_id, display_name, region, status, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, 'riot', displayName, displayName, region, 'available', JSON.stringify({ regionLabel: label }), timestamp, timestamp])
  }

  // Fill the local pool with realistic inventory so the dashboard exercises
  // pagination/aggregation paths without ever needing credential fixtures.
  for (let index = 1; index <= 49; index += 1) {
    const id = randomUUID()
    const region = index % 3 === 0 ? 'EUNE' : index % 3 === 1 ? 'EUW' : 'NA'
    const displayName = `Reserve-${String(index).padStart(2, '0')}#${region}`
    const status = index <= 3 ? 'maintenance' : 'available'
    database.run('INSERT INTO accounts (id, provider, external_id, display_name, region, status, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, 'riot', displayName, displayName, region, status, JSON.stringify({ regionLabel: region, level: 80 + index }), new Date(Date.now() - (200 + index) * 60_000).toISOString(), new Date(Date.now() - (200 + index) * 60_000).toISOString()])
    database.run('INSERT INTO account_assignments (id, account_id, user_id, status, assigned_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), id, adminId, 'active', timestamp, timestamp])
  }

  const assignmentRows = [
    [accountIds.get('Nova#EUW'), mayaId], [accountIds.get('Nova#EUW'), adminId],
    [accountIds.get('Atlas#NA1'), jonId], [accountIds.get('Atlas#NA1'), adminId],
    [accountIds.get('Morrow#KR1'), soraId], [accountIds.get('Morrow#KR1'), adminId],
    [accountIds.get('Orbit#BR1'), leoId], [accountIds.get('Orbit#BR1'), adminId],
    [accountIds.get('Lumen#EUNE'), adminId], [accountIds.get('Sable#LAN'), adminId],
  ] as const
  for (const [accountId, userId] of assignmentRows) database.run('INSERT INTO account_assignments (id, account_id, user_id, status, assigned_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), accountId!, userId, 'active', timestamp, timestamp])

  const deviceRows = [
    [adminId, 'admin-demo-key', 'macos', 'Alex’s MacBook Pro', '2.4.1'],
    [mayaId, 'maya-demo-key', 'macos', 'Maya’s MacBook Pro', '2.4.1'],
    [jonId, 'jon-demo-key', 'windows', 'Jon’s Studio PC', '2.4.0'],
    [soraId, 'sora-demo-key', 'macos', 'Sora’s Mac mini', '2.4.1'],
    [leoId, 'leo-demo-key', 'windows', 'Leo’s Gaming rig', '2.3.9'],
  ] as const
  const deviceIds = new Map<string, string>()
  for (const [userId, publicKey, platform, deviceName, appVersion] of deviceRows) {
    const id = randomUUID()
    deviceIds.set(userId, id)
    database.run('INSERT INTO user_devices (id, user_id, public_key, platform, device_name, app_version, status, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, userId, publicKey, platform, deviceName, appVersion, 'active', minutesAgo(1), timestamp])
  }

  const sessionRows = [
    ['Nova#EUW', mayaId, 'active', 18],
    ['Atlas#NA1', jonId, 'active', 42],
    ['Morrow#KR1', soraId, 'active', 66],
    ['Orbit#BR1', leoId, 'active', 2],
  ] as const
  for (const [accountName, userId, status, age] of sessionRows) {
    const id = randomUUID()
    database.run('INSERT INTO account_sessions (id, account_id, user_id, device_id, status, runtime_state, started_at, last_heartbeat_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, accountIds.get(accountName)!, userId, deviceIds.get(userId)!, status, 'LAUNCHING', minutesAgo(age), minutesAgo(age), timestamp])
    database.run('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), userId, 'SESSION_STARTED', 'account_sessions', id, JSON.stringify({ account: accountName }), minutesAgo(Math.max(1, age - 1))])
  }
  database.run('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), adminId, 'DEVICE_REGISTERED', 'user_devices', deviceIds.get(adminId)!, JSON.stringify({ platform: 'macos' }), minutesAgo(14)])
  database.run('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), adminId, 'ASSIGNMENT_UPDATED', 'account_assignments', accountIds.get('Atlas#NA1')!, JSON.stringify({ account: 'Atlas#NA1' }), minutesAgo(41)])
  await database.save()
}
