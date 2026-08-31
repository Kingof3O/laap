import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

type VaultRecord = { version: 1; iv: string; tag: string; ciphertext: string; updatedAt: string }
type VaultFile = Record<string, VaultRecord>

export interface CredentialVaultPort {
  has(accountId: string): boolean | Promise<boolean>
  set(accountId: string, username: string, password: string): Promise<void>
}

export class UnavailableCredentialVault implements CredentialVaultPort {
  has(_accountId: string) { return false }
  async set(_accountId: string, _username: string, _password: string): Promise<void> { throw new Error('production credentials must be written through Supabase Vault') }
}

export class LocalCredentialVault implements CredentialVaultPort {
  private savePromise: Promise<void> = Promise.resolve()

  private constructor(private readonly filePath: string, private readonly key: Buffer, private records: VaultFile) {}

  static async open(filePath: string, masterKey: string) {
    const key = createHash('sha256').update(masterKey).digest()
    let records: VaultFile = {}
    try {
      const raw = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown
      if (raw && typeof raw === 'object') records = raw as VaultFile
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return new LocalCredentialVault(filePath, key, records)
  }

  has(accountId: string) { return Boolean(this.records[accountId]) }

  async set(accountId: string, username: string, password: string) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ username, password }), 'utf8'), cipher.final()])
    this.records[accountId] = { version: 1, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url'), updatedAt: new Date().toISOString() }
    await this.save()
  }

  /** Internal-only read for a trusted desktop/Edge adapter. Never serialize this return value to the web UI. */
  read(accountId: string) {
    const record = this.records[accountId]
    if (!record) return null
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(record.iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(record.tag, 'base64url'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64url')), decipher.final()]).toString('utf8')) as { username: string; password: string }
  }

  private async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.${process.pid}.tmp`
    const snapshot = JSON.stringify(this.records)
    this.savePromise = this.savePromise.then(async () => {
      await fs.writeFile(temporary, snapshot, { mode: 0o600 })
      await fs.rename(temporary, this.filePath)
      await fs.chmod(this.filePath, 0o600)
    })
    return this.savePromise
  }
}
