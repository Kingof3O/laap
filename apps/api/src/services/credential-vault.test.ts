import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LocalCredentialVault } from './credential-vault.js'

describe('local credential vault adapter', () => {
  it('encrypts credentials at rest and decrypts only inside the trusted service', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'laap-vault-'))
    const filePath = path.join(directory, 'vault.json')
    const vault = await LocalCredentialVault.open(filePath, 'vault-test-master-key')
    await vault.set('account-1', 'riot-user', 'super-secret')
    const raw = await readFile(filePath, 'utf8')
    expect(raw).not.toContain('riot-user')
    expect(raw).not.toContain('super-secret')
    expect(vault.has('account-1')).toBe(true)
    expect(vault.read('account-1')).toEqual({ username: 'riot-user', password: 'super-secret' })
  })
})
