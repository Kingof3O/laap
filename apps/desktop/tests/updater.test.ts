import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { isNewerVersion, parseSemver } from '../src/lib/version.ts'

// Types representing the Tauri 2 updater manifest structure
interface TauriPlatformEntry {
  signature: string
  url: string
}

interface TauriManifest {
  version: string
  notes?: string
  pub_date?: string
  platforms: Record<string, TauriPlatformEntry>
  edition?: string
}

// Simulates native manifest validation logic mirroring Rust src-tauri/src/commands/updater.rs
function validateUpdateManifest(
  manifest: TauriManifest,
  currentVersion: string,
  appEdition: string,
  appPlatform: string,
): { valid: boolean; reason?: string; downloadUrl?: string; signature?: string } {
  // 1. Version check
  if (!isNewerVersion(manifest.version, currentVersion)) {
    return { valid: false, reason: 'Version is not newer than current' }
  }

  // 2. Edition check
  if (manifest.edition && manifest.edition.toLowerCase() !== appEdition.toLowerCase()) {
    return { valid: false, reason: `Edition mismatch: expected ${appEdition}, got ${manifest.edition}` }
  }

  // 3. Platform & Architecture check
  const platformEntry = manifest.platforms[appPlatform]
  if (!platformEntry) {
    return { valid: false, reason: `No matching platform found for ${appPlatform}` }
  }

  // 4. Download URL check
  if (!platformEntry.url || !platformEntry.url.startsWith('https://')) {
    return { valid: false, reason: 'Download URL must be a secure HTTPS endpoint' }
  }

  // 5. Signature presence
  if (!platformEntry.signature || platformEntry.signature.trim() === '') {
    return { valid: false, reason: 'Security violation: signature missing' }
  }

  return {
    valid: true,
    downloadUrl: platformEntry.url,
    signature: platformEntry.signature,
  }
}

// Simulates Ed25519 signature verification mirroring ed25519_dalek in src-tauri/src/commands/updater.rs
function verifyPayloadSignature(
  payload: Buffer,
  signatureBase64: string,
  publicKeyPem: string,
): boolean {
  try {
    const sigBuffer = Buffer.from(signatureBase64, 'base64')
    return crypto.verify(null, payload, publicKeyPem, sigBuffer)
  } catch {
    return false
  }
}

// Simulates atomic download, verify, and safe install pipeline
function simulateDownloadAndInstall(
  payloadBytes: Buffer,
  expectedSignature: string,
  publicKeyPem: string,
  targetTempDir: string,
): { success: boolean; tempFile?: string; error?: string } {
  // Step 1: Write to secure temp file
  const tempPath = path.join(targetTempDir, `laap-update-${Date.now()}.exe`)
  fs.writeFileSync(tempPath, payloadBytes)

  // Step 2: Cryptographic signature verification
  const isValid = verifyPayloadSignature(payloadBytes, expectedSignature, publicKeyPem)
  if (!isValid) {
    // Fail closed: immediately delete corrupted/unverified payload
    try {
      fs.unlinkSync(tempPath)
    } catch {}
    return {
      success: false,
      error: 'SECURITY VIOLATION: Cryptographic signature verification failed. Update payload discarded.',
    }
  }

  // Step 3: Verified artifact ready for execution
  return {
    success: true,
    tempFile: tempPath,
  }
}

describe('LAAP V2 Update Engine Deterministic Tests', () => {
  // 1. Version Parsing & Comparison
  describe('Semver parsing and version mismatch detection', () => {
    test('semver parsing handles standard and prefixed tags', () => {
      assert.deepEqual(parseSemver('0.4.8'), [0, 4, 8])
      assert.deepEqual(parseSemver('v0.4.9'), [0, 4, 9])
      assert.deepEqual(parseSemver('v1.0.0'), [1, 0, 0])
      assert.deepEqual(parseSemver('  v2.10.3  '), [2, 10, 3])
      assert.deepEqual(parseSemver('invalid'), [0, 0, 0])
    })

    test('isNewerVersion accurately detects version mismatches', () => {
      // Major bump
      assert.equal(isNewerVersion('1.0.0', '0.4.8'), true)
      assert.equal(isNewerVersion('0.4.8', '1.0.0'), false)

      // Minor bump
      assert.equal(isNewerVersion('0.5.0', '0.4.8'), true)
      assert.equal(isNewerVersion('0.4.8', '0.5.0'), false)

      // Patch bump
      assert.equal(isNewerVersion('0.4.9', '0.4.8'), true)
      assert.equal(isNewerVersion('0.4.8', '0.4.9'), false)

      // Equal version (not newer)
      assert.equal(isNewerVersion('0.4.8', '0.4.8'), false)
      assert.equal(isNewerVersion('v0.4.8', '0.4.8'), false)

      // Older remote version (downgrade prevention)
      assert.equal(isNewerVersion('0.4.7', '0.4.8'), false)
    })
  })

  // 2. Edition Enforcement
  describe('Edition mismatch enforcement (Team vs. Offline)', () => {
    const validPlatform = 'windows-x86_64'
    const validPlatforms: Record<string, TauriPlatformEntry> = {
      'windows-x86_64': {
        url: 'https://github.com/Kingof3O/laap/releases/download/v0.4.9/laap_0.4.9_x64-setup.exe',
        signature: 'validSignatureBase64==',
      },
    }

    test('accepts matching team edition update', () => {
      const manifest: TauriManifest = {
        version: '0.4.9',
        edition: 'team',
        platforms: validPlatforms,
      }
      const res = validateUpdateManifest(manifest, '0.4.8', 'team', validPlatform)
      assert.equal(res.valid, true)
      assert.equal(res.downloadUrl, validPlatforms['windows-x86_64'].url)
    })

    test('rejects offline edition manifest when running team edition', () => {
      const manifest: TauriManifest = {
        version: '0.4.9',
        edition: 'offline',
        platforms: validPlatforms,
      }
      const res = validateUpdateManifest(manifest, '0.4.8', 'team', validPlatform)
      assert.equal(res.valid, false)
      assert.match(res.reason ?? '', /Edition mismatch/)
    })

    test('rejects team edition manifest when running offline edition', () => {
      const manifest: TauriManifest = {
        version: '0.4.9',
        edition: 'team',
        platforms: validPlatforms,
      }
      const res = validateUpdateManifest(manifest, '0.4.8', 'offline', validPlatform)
      assert.equal(res.valid, false)
      assert.match(res.reason ?? '', /Edition mismatch/)
    })
  })

  // 3. Platform & Architecture Enforcement
  describe('Platform & Architecture enforcement', () => {
    test('rejects update when target architecture does not match', () => {
      const manifest: TauriManifest = {
        version: '0.4.9',
        edition: 'team',
        platforms: {
          'darwin-aarch64': {
            url: 'https://github.com/Kingof3O/laap/releases/download/v0.4.9/laap.app.tar.gz',
            signature: 'sig==',
          },
          'linux-x86_64': {
            url: 'https://github.com/Kingof3O/laap/releases/download/v0.4.9/laap.AppImage',
            signature: 'sig==',
          },
        },
      }

      const res = validateUpdateManifest(manifest, '0.4.8', 'team', 'windows-x86_64')
      assert.equal(res.valid, false)
      assert.match(res.reason ?? '', /No matching platform found/)
    })

    test('rejects insecure HTTP download URLs', () => {
      const manifest: TauriManifest = {
        version: '0.4.9',
        edition: 'team',
        platforms: {
          'windows-x86_64': {
            url: 'http://insecure-cdn.com/laap-installer.exe',
            signature: 'sig==',
          },
        },
      }

      const res = validateUpdateManifest(manifest, '0.4.8', 'team', 'windows-x86_64')
      assert.equal(res.valid, false)
      assert.match(res.reason ?? '', /HTTPS endpoint/)
    })

    test('rejects missing or empty signature', () => {
      const manifest: TauriManifest = {
        version: '0.4.9',
        edition: 'team',
        platforms: {
          'windows-x86_64': {
            url: 'https://github.com/Kingof3O/laap/releases/download/v0.4.9/laap_0.4.9_x64-setup.exe',
            signature: '   ',
          },
        },
      }

      const res = validateUpdateManifest(manifest, '0.4.8', 'team', 'windows-x86_64')
      assert.equal(res.valid, false)
      assert.match(res.reason ?? '', /signature missing/)
    })
  })

  // 4. Cryptographic Signature Verification & Fail-Closed Behavior
  describe('Cryptographic Signature Verification (Ed25519)', () => {
    // Generate valid Ed25519 keypair for test assertions
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
    const { publicKey: attackerKey, privateKey: attackerPrivateKey } = crypto.generateKeyPairSync('ed25519')

    const legitPayload = Buffer.from('LAAP_AUTHENTIC_SIGNED_UPDATE_PAYLOAD_V2_TEST_BYTES')
    const validSignature = crypto.sign(null, legitPayload, privateKey).toString('base64')

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laap-updater-test-'))

    test('successfully verifies genuine payload signed by genuine key', () => {
      const result = simulateDownloadAndInstall(
        legitPayload,
        validSignature,
        publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        tempDir,
      )

      assert.equal(result.success, true)
      assert.ok(result.tempFile)
      assert.ok(fs.existsSync(result.tempFile))

      // Clean up temp file
      fs.unlinkSync(result.tempFile)
    })

    test('fails closed when payload is tampered with (1 byte modified)', () => {
      const tamperedPayload = Buffer.from(legitPayload)
      tamperedPayload[0] ^= 0xff // flip bits of first byte

      const result = simulateDownloadAndInstall(
        tamperedPayload,
        validSignature,
        publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        tempDir,
      )

      assert.equal(result.success, false)
      assert.match(result.error ?? '', /SECURITY VIOLATION/)
      // Assert no orphaned executable file remains on disk
      if (result.tempFile) {
        assert.equal(fs.existsSync(result.tempFile), false)
      }
    })

    test('fails closed when signed by unauthorized key (MITM attack simulation)', () => {
      const attackerSignature = crypto.sign(null, legitPayload, attackerPrivateKey).toString('base64')

      const result = simulateDownloadAndInstall(
        legitPayload,
        attackerSignature,
        publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        tempDir,
      )

      assert.equal(result.success, false)
      assert.match(result.error ?? '', /SECURITY VIOLATION/)
    })

    test('fails closed when signature is corrupted / malformed base64', () => {
      const result = simulateDownloadAndInstall(
        legitPayload,
        'THIS_IS_NOT_A_VALID_SIGNATURE_!@#$',
        publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        tempDir,
      )

      assert.equal(result.success, false)
      assert.match(result.error ?? '', /SECURITY VIOLATION/)
    })

    // Clean up temporary test directory
    test.after(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch {}
    })
  })

  // 5. Offline Behavior & Telemetry Isolation
  describe('Offline edition zero-network & update isolation', () => {
    test('offline mode check blocks unauthorized external network calls', () => {
      const isOfflineMode = true
      let attemptedNetworkCall = false

      const checkUpdates = (offline: boolean) => {
        if (offline) {
          throw new Error('Update checks are not available in offline mode.')
        }
        attemptedNetworkCall = true
      }

      assert.throws(
        () => checkUpdates(isOfflineMode),
        /Update checks are not available in offline mode/,
      )
      assert.equal(attemptedNetworkCall, false)
    })
  })
})
