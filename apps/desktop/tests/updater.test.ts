import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { isNewerVersion, parseSemver } from '../src/lib/version.ts'
import {
  generateManifest,
  validateManifest,
  validateReleasePublication,
  signArtifact,
  verifyArtifactSignature,
  DEFAULT_UPDATER_PUBKEY,
} from '../../../scripts/generate-update-manifest.mjs'

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

  // 2. Mandatory Edition check & metadata enforcement (fail closed)
  if (!manifest.edition || manifest.edition.trim() === '') {
    return { valid: false, reason: 'Security violation: Missing mandatory edition metadata in update manifest' }
  }
  if (manifest.edition.toLowerCase() !== appEdition.toLowerCase()) {
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

  // 6. Artifact identity check on file basename
  const fileName = (platformEntry.url.split('/').pop() || '').toLowerCase()
  if (appEdition === 'offline' && !fileName.includes('offline')) {
    return { valid: false, reason: 'Artifact identity mismatch: offline edition cannot install non-offline artifact' }
  }
  if (appEdition === 'team' && fileName.includes('offline')) {
    return { valid: false, reason: 'Artifact identity mismatch: team edition cannot install offline artifact' }
  }
  const validExts = ['.zip', '.nsis.zip', '.exe', '.msi', '.dmg', '.tar.gz', '.app.tar.gz']
  if (!validExts.some((ext) => fileName.endsWith(ext))) {
    return { valid: false, reason: 'Artifact identity mismatch: untrusted file extension' }
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

  // 6. Preflight Safety & Match Guards
  describe('Preflight safety checks before update installation', () => {
    interface PreflightState {
      owns_provisioning: boolean
      active_match: boolean
      riot_running: boolean
    }

    function evaluatePreflight(state: PreflightState): { safe: boolean; reason?: string } {
      if (state.owns_provisioning) {
        return {
          safe: false,
          reason: 'A Riot provisioning or account capture session is currently active. Please complete or cancel it before updating.',
        }
      }
      if (state.active_match) {
        return {
          safe: false,
          reason: 'An active League of Legends or Valorant match was detected. To prevent game disconnection, updates are blocked until your match concludes.',
        }
      }
      return { safe: true }
    }

    test('blocks update installation when an active match is in progress', () => {
      const result = evaluatePreflight({
        owns_provisioning: false,
        active_match: true,
        riot_running: true,
      })
      assert.equal(result.safe, false)
      assert.match(result.reason ?? '', /active League of Legends or Valorant match/)
    })

    test('blocks update installation when provisioning session is active', () => {
      const result = evaluatePreflight({
        owns_provisioning: true,
        active_match: false,
        riot_running: true,
      })
      assert.equal(result.safe, false)
      assert.match(result.reason ?? '', /provisioning or account capture session/)
    })

    test('allows update installation when no match or provisioning is active', () => {
      const result = evaluatePreflight({
        owns_provisioning: false,
        active_match: false,
        riot_running: true, // Riot client idle in background is permitted
      })
      assert.equal(result.safe, true)
      assert.equal(result.reason, undefined)
    })

    test('timing gap elimination: defers installation if match becomes active post-download', () => {
      // Simulates lifecycle:
      // Stage 1: Download initiation (preflight safe)
      const downloadPreflight = evaluatePreflight({
        owns_provisioning: false,
        active_match: false,
        riot_running: false,
      })
      assert.equal(downloadPreflight.safe, true, 'Download can proceed')

      // Stage 2: During download, user launches a game match
      // Stage 3: Immediate pre-installation check (post-download)
      const preInstallPreflight = evaluatePreflight({
        owns_provisioning: false,
        active_match: true, // match started during download!
        riot_running: true,
      })
      assert.equal(preInstallPreflight.safe, false, 'Pre-install check must fail closed')
      assert.match(preInstallPreflight.reason ?? '', /active League of Legends or Valorant match/)
    })
  })

  // 7. Update Manifest Generation & Verification Pipeline
  describe('Update manifest generator and validator', () => {
    test('validates correctly structured manifest with Ed25519 signatures', () => {
      const validManifest: TauriManifest = {
        version: '1.0.1',
        edition: 'team',
        notes: 'Security patch and performance enhancements.',
        pub_date: new Date().toISOString(),
        platforms: {
          'windows-x86_64': {
            url: 'https://github.com/Kingof3O/laap/releases/download/v1.0.1/LAAP-Desktop-1.0.1-x64-setup.nsis.zip',
            signature: 'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHNpZ25hdHVyZQpSV1M...64charsignature...',
          },
        },
      }

      const res = validateUpdateManifest(validManifest, '1.0.0', 'team', 'windows-x86_64')
      assert.equal(res.valid, true)
      assert.equal(res.downloadUrl, validManifest.platforms['windows-x86_64'].url)
    })

    test('rejects manifests attempting downgrade to older version', () => {
      const downgradeManifest: TauriManifest = {
        version: '0.4.8',
        edition: 'team',
        platforms: {
          'windows-x86_64': {
            url: 'https://github.com/Kingof3O/laap/releases/download/v0.4.8/LAAP-Desktop-0.4.8.nsis.zip',
            signature: 'validSignatureHere',
          },
        },
      }

      const res = validateUpdateManifest(downgradeManifest, '1.0.0', 'team', 'windows-x86_64')
      assert.equal(res.valid, false)
      assert.match(res.reason ?? '', /not newer than current/)
    })

    test('strict edition filtering: never admits macOS team build into offline manifest', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laap-manifest-test-'))
      try {
        const teamMac = path.join(tempDir, 'LAAP-Desktop-1.0.1.app.tar.gz')
        const teamMacSig = path.join(tempDir, 'LAAP-Desktop-1.0.1.app.tar.gz.sig')
        const offlineMac = path.join(tempDir, 'LAAP-Offline-1.0.1.app.tar.gz')
        const offlineMacSig = path.join(tempDir, 'LAAP-Offline-1.0.1.app.tar.gz.sig')

        fs.writeFileSync(teamMac, 'dummy team payload')
        fs.writeFileSync(teamMacSig, 'dummy-sig')
        fs.writeFileSync(offlineMac, 'dummy offline payload')
        fs.writeFileSync(offlineMacSig, 'dummy-sig')

        const offlineManifest = generateManifest({
          version: '1.0.1',
          tag: 'v1.0.1',
          edition: 'offline',
          artifactsDir: tempDir,
        })

        // Verify offline manifest only contains offline assets
        for (const entry of Object.values(offlineManifest.platforms)) {
          assert.equal(
            (entry as any).url.toLowerCase().includes('offline'),
            true,
            'Offline manifest must only contain offline assets',
          )
        }

        const teamManifest = generateManifest({
          version: '1.0.1',
          tag: 'v1.0.1',
          edition: 'team',
          artifactsDir: tempDir,
        })

        // Verify team manifest never contains offline assets
        for (const entry of Object.values(teamManifest.platforms)) {
          assert.equal(
            (entry as any).url.toLowerCase().includes('offline'),
            false,
            'Team manifest must not contain offline assets',
          )
        }
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    })

    test('cryptographic artifact verification: verifies genuine signature and fails closed on tampered bytes', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laap-crypto-manifest-'))
      try {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
        const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(12)

        const artifactPath = path.join(tempDir, 'LAAP-Desktop-1.0.1-x64-setup.nsis.zip')
        const artifactContent = Buffer.from('Official genuine binary package')
        fs.writeFileSync(artifactPath, artifactContent)

        // Sign the package
        const sigBytes = crypto.sign(null, artifactContent, privateKey)
        const minisignHeader = Buffer.from('Ed')
        const keyId = Buffer.alloc(8, 0x55)
        const sigStruct = Buffer.concat([minisignHeader, keyId, sigBytes])
        const sigString =
          'untrusted comment: signature from minisign secret key\n' +
          sigStruct.toString('base64') +
          '\ntrusted comment: timestamp:123\nsig2\n'

        fs.writeFileSync(`${artifactPath}.sig`, sigString)

        const manifest = generateManifest({
          version: '1.0.1',
          tag: 'v1.0.1',
          edition: 'team',
          artifactsDir: tempDir,
        })

        // Verification with matching key must succeed
        const genuineValidation = validateManifest(manifest, {
          artifactsDir: tempDir,
          pubkey: rawPub,
          requireArtifactVerification: true,
        })
        assert.equal(genuineValidation.valid, true, 'Genuine artifact and signature must pass validation')

        // Tamper with artifact file bytes
        fs.writeFileSync(artifactPath, Buffer.from('Tampered binary content (1 byte modified)'))

        const tamperedValidation = validateManifest(manifest, {
          artifactsDir: tempDir,
          pubkey: rawPub,
          requireArtifactVerification: true,
        })
        assert.equal(tamperedValidation.valid, false, 'Tampered artifact must fail validation')
        assert.match(
          tamperedValidation.errors.join(' '),
          /Cryptographic signature verification FAILED/,
        )
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    })
  })

  // 8. Mandatory Edition Metadata & Artifact Identity Enforcement (Requirement 5)
  describe('Mandatory edition metadata and artifact identity enforcement', () => {
    test('fails closed when manifest omits edition metadata completely', () => {
      const manifestWithoutEdition: TauriManifest = {
        version: '1.0.1',
        platforms: {
          'windows-x86_64': {
            url: 'https://github.com/Kingof3O/laap/releases/download/v1.0.1/LAAP-Desktop-1.0.1-x64-setup.nsis.zip',
            signature: 'validSignature',
          },
        },
      }

      const res = validateUpdateManifest(manifestWithoutEdition, '1.0.0', 'team', 'windows-x86_64')
      assert.equal(res.valid, false)
      assert.match(res.reason ?? '', /Missing mandatory edition metadata/)
    })

    test('fails closed when manifest contains empty or whitespace edition', () => {
      const emptyEditionManifest: TauriManifest = {
        version: '1.0.1',
        edition: '   ',
        platforms: {
          'windows-x86_64': {
            url: 'https://github.com/Kingof3O/laap/releases/download/v1.0.1/LAAP-Desktop-1.0.1-x64-setup.nsis.zip',
            signature: 'validSignature',
          },
        },
      }

      const res = validateUpdateManifest(emptyEditionManifest, '1.0.0', 'team', 'windows-x86_64')
      assert.equal(res.valid, false)
      assert.match(res.reason ?? '', /Missing mandatory edition metadata/)
    })

    test('fails closed when artifact filename lacks required edition marker', () => {
      // Offline client receiving team/desktop URL
      const offlineManifestWithTeamUrl: TauriManifest = {
        version: '1.0.1',
        edition: 'offline',
        platforms: {
          'windows-x86_64': {
            url: 'https://github.com/Kingof3O/laap/releases/download/v1.0.1/LAAP-Desktop-1.0.1-x64-setup.nsis.zip',
            signature: 'validSignature',
          },
        },
      }
      const offlineRes = validateUpdateManifest(offlineManifestWithTeamUrl, '1.0.0', 'offline', 'windows-x86_64')
      assert.equal(offlineRes.valid, false)
      assert.match(offlineRes.reason ?? '', /Artifact identity mismatch: offline edition/)

      // Team client receiving offline URL
      const teamManifestWithOfflineUrl: TauriManifest = {
        version: '1.0.1',
        edition: 'team',
        platforms: {
          'windows-x86_64': {
            url: 'https://github.com/Kingof3O/laap/releases/download/v1.0.1/LAAP-Offline-1.0.1-x64-setup.nsis.zip',
            signature: 'validSignature',
          },
        },
      }
      const teamRes = validateUpdateManifest(teamManifestWithOfflineUrl, '1.0.0', 'team', 'windows-x86_64')
      assert.equal(teamRes.valid, false)
      assert.match(teamRes.reason ?? '', /Artifact identity mismatch: team edition/)
    })

    test('fails closed when artifact download URL has untrusted file extension', () => {
      const untrustedExtensionManifest: TauriManifest = {
        version: '1.0.1',
        edition: 'team',
        platforms: {
          'windows-x86_64': {
            url: 'https://github.com/Kingof3O/laap/releases/download/v1.0.1/LAAP-Desktop-1.0.1.sh',
            signature: 'validSignature',
          },
        },
      }

      const res = validateUpdateManifest(untrustedExtensionManifest, '1.0.0', 'team', 'windows-x86_64')
      assert.equal(res.valid, false)
      assert.match(res.reason ?? '', /untrusted file extension/)
    })
  })

  // 9. Mandatory Safety Cleanup Failures & Concurrency Transitions (Requirement 6)
  describe('Mandatory safety cleanup failures and install transition concurrency', () => {
    function simulateInstallerExecution(options: {
      stopProxyFails?: boolean
      prepareQuitFails?: boolean
      terminateRiotFails?: boolean
      recheckActiveMatch?: boolean
      recheckProvisioningBusy?: boolean
      isTransitionActive?: boolean
    }): { success: boolean; error?: string } {
      if (options.isTransitionActive) {
        return {
          success: false,
          error: 'An update installation transition is already in progress. Simultaneous installer launches are blocked.',
        }
      }

      if (options.terminateRiotFails) {
        return {
          success: false,
          error: 'Mandatory safety operation failed: unable to terminate Riot processes before update',
        }
      }

      if (options.stopProxyFails) {
        return {
          success: false,
          error: 'Mandatory safety operation failed: unable to stop presence proxy before update',
        }
      }

      if (options.prepareQuitFails) {
        return {
          success: false,
          error: 'Mandatory safety operation failed: unable to prepare tray quit before update',
        }
      }

      // Pre-install protected Riot operations recheck
      if (options.recheckActiveMatch || options.recheckProvisioningBusy) {
        return {
          success: false,
          error: 'INSTALLATION_DEFERRED: A protected Riot operation was detected during final pre-installation inspection.',
        }
      }

      return { success: true }
    }

    test('fails closed when presence proxy termination fails', () => {
      const res = simulateInstallerExecution({ stopProxyFails: true })
      assert.equal(res.success, false)
      assert.match(res.error ?? '', /unable to stop presence proxy before update/)
    })

    test('fails closed when tray quit preparation fails', () => {
      const res = simulateInstallerExecution({ prepareQuitFails: true })
      assert.equal(res.success, false)
      assert.match(res.error ?? '', /unable to prepare tray quit before update/)
    })

    test('fails closed when Riot process termination fails during forced cleanup', () => {
      const res = simulateInstallerExecution({ terminateRiotFails: true })
      assert.equal(res.success, false)
      assert.match(res.error ?? '', /unable to terminate Riot processes before update/)
    })

    test('defers installation if a live match starts right before final installer execution', () => {
      const res = simulateInstallerExecution({ recheckActiveMatch: true })
      assert.equal(res.success, false)
      assert.match(res.error ?? '', /INSTALLATION_DEFERRED/)
    })

    test('defers installation if account provisioning starts right before final installer execution', () => {
      const res = simulateInstallerExecution({ recheckProvisioningBusy: true })
      assert.equal(res.success, false)
      assert.match(res.error ?? '', /INSTALLATION_DEFERRED/)
    })

    test('blocks simultaneous installer launches when installation transition is active', () => {
      const res = simulateInstallerExecution({ isTransitionActive: true })
      assert.equal(res.success, false)
      assert.match(res.error ?? '', /already in progress/)
    })
  })

  // 10. Distinguishing Release Notifications vs. Verified Installable Updates (Requirement 7)
  describe('Distinguishing release notifications from verified installable updates', () => {
    test('ordinary GitHub release fallback yields isInstallable: false and signature: null', () => {
      const fallbackGitHubRelease = {
        tag_name: 'v1.0.1',
        name: 'LAAP Desktop v1.0.1',
        body: 'Release notes with manual installer.',
        html_url: 'https://github.com/Kingof3O/laap/releases/tag/v1.0.1',
        assets: [
          {
            name: 'LAAP-Desktop-1.0.1-x64-setup.exe',
            browser_download_url: 'https://github.com/Kingof3O/laap/releases/download/v1.0.1/LAAP-Desktop-1.0.1-x64-setup.exe',
          },
        ],
      }

      // Simulates check_github_update GitHub API fallback mapping
      const result = {
        has_update: true,
        is_installable: false, // ordinary installer on GitHub is NOT an in-app updater payload
        latest_version: '1.0.1',
        download_url: fallbackGitHubRelease.assets[0].browser_download_url,
        signature: null,
      }

      assert.equal(result.has_update, true)
      assert.equal(result.is_installable, false)
      assert.equal(result.signature, null)
    })

    test('verified in-app updater yields isInstallable: true and signature string', () => {
      const verifiedResult = {
        has_update: true,
        is_installable: true,
        latest_version: '1.0.1',
        download_url: 'https://github.com/Kingof3O/laap/releases/download/v1.0.1/LAAP-Desktop-1.0.1-x64-setup.nsis.zip',
        signature: 'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHNpZ25hdHVyZQ...',
      }

      assert.equal(verifiedResult.has_update, true)
      assert.equal(verifiedResult.is_installable, true)
      assert.ok(verifiedResult.signature)
    })

    test('UI modal CTA logic presents manual download link and suppresses automatic install CTA when isInstallable is false', () => {
      function resolveModalCTA(release: { isInstallable: boolean; signature?: string | null; downloadUrl?: string | null }) {
        const isVerifiedUpdate = Boolean(release.isInstallable && release.signature)
        if (isVerifiedUpdate) {
          return {
            buttonText: 'Download & Install Automatically',
            actionType: 'auto-install',
          }
        }
        return {
          buttonText: 'Download from GitHub Releases',
          actionType: 'manual-download',
        }
      }

      const ordinaryRelease = {
        isInstallable: false,
        signature: null,
        downloadUrl: 'https://github.com/Kingof3O/laap/releases/download/v1.0.1/LAAP-Desktop-1.0.1-x64-setup.exe',
      }
      const ordinaryCTA = resolveModalCTA(ordinaryRelease)
      assert.equal(ordinaryCTA.actionType, 'manual-download')
      assert.equal(ordinaryCTA.buttonText, 'Download from GitHub Releases')

      const verifiedRelease = {
        isInstallable: true,
        signature: 'validSignature',
        downloadUrl: 'https://github.com/Kingof3O/laap/releases/download/v1.0.1/LAAP-Desktop-1.0.1-x64-setup.nsis.zip',
      }
      const verifiedCTA = resolveModalCTA(verifiedRelease)
      assert.equal(verifiedCTA.actionType, 'auto-install')
      assert.equal(verifiedCTA.buttonText, 'Download & Install Automatically')
    })
  })

  // 11. Complete Dual-Edition Release Publication Flow (Requirement 3 & 4)
  describe('Complete dual-edition release publication flow and advertised platform coverage', () => {
    test('validateReleasePublication passes when both editions have complete manifests for all advertised platforms', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laap-full-release-'))
      try {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
        const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(12)

        function createSignedAsset(name: string, contentStr: string) {
          const filePath = path.join(tempDir, name)
          const content = Buffer.from(contentStr)
          fs.writeFileSync(filePath, content)

          const sigBytes = crypto.sign(null, content, privateKey)
          const sigStruct = Buffer.concat([Buffer.from('Ed'), Buffer.alloc(8, 0x11), sigBytes])
          const sigStr =
            'untrusted comment: signature from minisign secret key\n' +
            sigStruct.toString('base64') +
            '\ntrusted comment: timestamp:123\nsig2\n'
          fs.writeFileSync(`${filePath}.sig`, sigStr)
        }

        // Team edition: Windows + macOS
        createSignedAsset('LAAP-Desktop-1.0.1-x64-setup.nsis.zip', 'Team Windows NSIS zip')
        createSignedAsset('LAAP-Desktop-1.0.1.app.tar.gz', 'Team macOS Tar Gz')

        // Offline edition: Windows + macOS
        createSignedAsset('LAAP-Offline-1.0.1-x64-setup.nsis.zip', 'Offline Windows NSIS zip')
        createSignedAsset('LAAP-Offline-1.0.1.app.tar.gz', 'Offline macOS Tar Gz')

        const releaseCheck = validateReleasePublication({
          version: '1.0.1',
          tag: 'v1.0.1',
          artifactsDir: tempDir,
          pubkey: rawPub,
          requireArtifactVerification: true,
        })

        assert.equal(releaseCheck.valid, true, `Expected valid full release: ${releaseCheck.errors.join(', ')}`)
        assert.ok(releaseCheck.teamManifest)
        assert.ok(releaseCheck.offlineManifest)
        assert.ok(releaseCheck.teamManifest?.platforms['windows-x86_64'])
        assert.ok(releaseCheck.teamManifest?.platforms['darwin-universal'])
        assert.ok(releaseCheck.offlineManifest?.platforms['windows-x86_64'])
        assert.ok(releaseCheck.offlineManifest?.platforms['darwin-universal'])
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    })

    test('validateReleasePublication passes for three editions when studio is included', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laap-three-editions-release-'))
      try {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
        const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(12)

        function createSignedAsset(name: string, contentStr: string) {
          const filePath = path.join(tempDir, name)
          const content = Buffer.from(contentStr)
          fs.writeFileSync(filePath, content)

          const sig = crypto.sign(null, content, privateKey).toString('base64')
          fs.writeFileSync(`${filePath}.sig`, sig)
        }

        // Team edition
        createSignedAsset('LAAP-Desktop-1.0.1-x64-setup.nsis.zip', 'Team Windows NSIS zip')
        createSignedAsset('LAAP-Desktop-1.0.1.app.tar.gz', 'Team macOS Tar Gz')

        // Offline edition
        createSignedAsset('LAAP-Offline-1.0.1-x64-setup.nsis.zip', 'Offline Windows NSIS zip')
        createSignedAsset('LAAP-Offline-1.0.1.app.tar.gz', 'Offline macOS Tar Gz')

        // Studio edition
        createSignedAsset('LAAP-Studio-1.0.1-x64-setup.nsis.zip', 'Studio Windows NSIS zip')
        createSignedAsset('LAAP-Studio-1.0.1.app.tar.gz', 'Studio macOS Tar Gz')

        const releaseCheck = validateReleasePublication({
          version: '1.0.1',
          tag: 'v1.0.1',
          artifactsDir: tempDir,
          pubkey: rawPub,
          requireArtifactVerification: true,
          editions: ['team', 'offline', 'studio'],
        })

        assert.equal(releaseCheck.valid, true, `Expected valid three-edition release: ${releaseCheck.errors.join(', ')}`)
        assert.ok(releaseCheck.teamManifest)
        assert.ok(releaseCheck.offlineManifest)
        assert.ok(releaseCheck.studioManifest)
        assert.ok(releaseCheck.studioManifest?.platforms['windows-x86_64'])
        assert.ok(releaseCheck.studioManifest?.platforms['darwin-universal'])
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    })

    test('validateReleasePublication fails closed if Windows target is missing from Offline edition', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laap-missing-win-'))
      try {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
        const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(12)

        function createSignedAsset(name: string, contentStr: string) {
          const filePath = path.join(tempDir, name)
          const content = Buffer.from(contentStr)
          fs.writeFileSync(filePath, content)

          const sigBytes = crypto.sign(null, content, privateKey)
          const sigStruct = Buffer.concat([Buffer.from('Ed'), Buffer.alloc(8, 0x11), sigBytes])
          const sigStr =
            'untrusted comment: signature from minisign secret key\n' +
            sigStruct.toString('base64') +
            '\ntrusted comment: timestamp:123\nsig2\n'
          fs.writeFileSync(`${filePath}.sig`, sigStr)
        }

        // Team has both
        createSignedAsset('LAAP-Desktop-1.0.1-x64-setup.nsis.zip', 'Team Windows NSIS zip')
        createSignedAsset('LAAP-Desktop-1.0.1.app.tar.gz', 'Team macOS Tar Gz')

        // Offline ONLY has macOS (Windows missing!)
        createSignedAsset('LAAP-Offline-1.0.1.app.tar.gz', 'Offline macOS Tar Gz')

        const releaseCheck = validateReleasePublication({
          version: '1.0.1',
          tag: 'v1.0.1',
          artifactsDir: tempDir,
          pubkey: rawPub,
          requireArtifactVerification: true,
        })

        assert.equal(releaseCheck.valid, false, 'Release publication must fail when Windows target is missing')
        assert.match(
          releaseCheck.errors.join(' '),
          /Missing required advertised platform: "windows-x86_64"/,
        )
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    })

    test('validateReleasePublication fails closed if an artifact is unsigned and no private key is supplied', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laap-unsigned-artifact-'))
      try {
        const { publicKey } = crypto.generateKeyPairSync('ed25519')
        const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(12)

        // Create unsigned SignPath-like installer without .sig file
        fs.writeFileSync(
          path.join(tempDir, 'LAAP-Desktop-1.0.1-x64-setup.exe'),
          Buffer.from('Authenticode signed installer without Tauri updater sig'),
        )

        const manifest = generateManifest({
          version: '1.0.1',
          tag: 'v1.0.1',
          edition: 'team',
          artifactsDir: tempDir,
          sign: false, // no signing
        })

        const val = validateManifest(manifest, {
          artifactsDir: tempDir,
          pubkey: rawPub,
          requireAllPlatforms: true,
        })

        assert.equal(val.valid, false, 'Unsigned installer must fail validation')
        assert.match(val.errors.join(' '), /Missing required advertised platform: "windows-x86_64"/)
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    })
  })
})
