import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, isEncryptedSecret } from './secret-box.js'

describe('secret box', () => {
  const key = 'test-vault-key-that-is-longer-than-32-characters'

  it('encrypts and decrypts a session envelope with context binding', () => {
    const encrypted = encryptSecret('session-data', key, 'account:123')
    expect(isEncryptedSecret(encrypted)).toBe(true)
    expect(decryptSecret(encrypted, key, 'account:123')).toEqual({ value: 'session-data', legacyPlaintext: false })
    expect(() => decryptSecret(encrypted, key, 'account:other')).toThrow()
  })

  it('recognizes legacy plaintext for one-time migration', () => {
    expect(decryptSecret('legacy-session', key, 'account:123')).toEqual({ value: 'legacy-session', legacyPlaintext: true })
    expect(isEncryptedSecret('legacy-session')).toBe(false)
  })
})
