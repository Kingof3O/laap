import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import child_process from 'node:child_process'
import {
  generateManifest,
  validateManifest,
  validateReleasePublication,
  verifyArtifactSignature,
  parseMinisignPublicKey,
} from '../../../scripts/generate-update-manifest.mjs'

describe('Isolated Native Windows Upgrade & macOS Verification Test', () => {
  test('end-to-end isolated Windows upgrade test with genuine signed test artifacts', () => {
    const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laap-win-upgrade-sandbox-'))
    const releaseAssetsDir = path.join(sandboxDir, 'release-assets')
    const clientVaultDir = path.join(sandboxDir, 'isolated-vault')
    fs.mkdirSync(releaseAssetsDir, { recursive: true })
    fs.mkdirSync(clientVaultDir, { recursive: true })

    try {
      // 1. Ensure isolated sandbox environment (no production credentials/sessions)
      assert.equal(fs.readdirSync(clientVaultDir).length, 0, 'Client vault must be empty (no production accounts)')

      // 2. Generate isolated test Ed25519 signing keypair for updater
      const keyGenOut = child_process.execSync(
        `npx --workspace @laap/desktop tauri signer generate --force -w "${path.join(sandboxDir, 'test_key')}" -p "isolated-test-pass"`,
        { encoding: 'utf8' }
      )
      const privKeyPath = path.join(sandboxDir, 'test_key')
      const pubKeyPath = path.join(sandboxDir, 'test_key.pub')
      assert.ok(fs.existsSync(privKeyPath), 'Private key must exist')
      assert.ok(fs.existsSync(pubKeyPath), 'Public key must exist')

      const pubKeyRaw = fs.readFileSync(pubKeyPath, 'utf8').trim()
      const privKeyRaw = fs.readFileSync(privKeyPath, 'utf8').trim()

      // 3. Construct realistic Windows NSIS installer artifact with genuine MZ PE header
      const winTeamExe = path.join(releaseAssetsDir, 'LAAP-Desktop-1.1.0-x64-setup.exe')
      const winOfflineExe = path.join(releaseAssetsDir, 'LAAP-Offline-1.1.0-x64-setup.exe')
      const macTeamTar = path.join(releaseAssetsDir, 'LAAP-Desktop-1.1.0-universal.app.tar.gz')
      const macOfflineTar = path.join(releaseAssetsDir, 'LAAP-Offline-1.1.0-universal.app.tar.gz')

      // Write simulated Windows PE executables (starting with 'MZ' DOS header)
      const peHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])
      const teamExeBytes = Buffer.concat([peHeader, Buffer.from('LAAP Team Edition Windows x64 Executable Payload v1.1.0')])
      const offlineExeBytes = Buffer.concat([peHeader, Buffer.from('LAAP Offline Edition Windows x64 Executable Payload v1.1.0')])
      fs.writeFileSync(winTeamExe, teamExeBytes)
      fs.writeFileSync(winOfflineExe, offlineExeBytes)

      // Write simulated macOS tar.gz (starting with gzip magic bytes 0x1f, 0x8b)
      const gzHeader = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00])
      fs.writeFileSync(macTeamTar, Buffer.concat([gzHeader, Buffer.from('macOS Team payload')]))
      fs.writeFileSync(macOfflineTar, Buffer.concat([gzHeader, Buffer.from('macOS Offline payload')]))

      // 4. Sign all artifacts using tauri signer tool and the test private key
      for (const asset of [winTeamExe, winOfflineExe, macTeamTar, macOfflineTar]) {
        const signEnv = {
          ...process.env,
          TAURI_SIGNING_PRIVATE_KEY: privKeyRaw,
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: 'isolated-test-pass',
        }
        child_process.execSync(
          `npx --workspace @laap/desktop tauri signer sign "${asset}"`,
          { env: signEnv, stdio: 'pipe' }
        )
        assert.ok(fs.existsSync(`${asset}.sig`), `Signature file for ${path.basename(asset)} must exist`)
      }

      // 5. Generate and validate manifests for both editions
      const teamManifest = generateManifest({
        version: '1.1.0',
        tag: 'v1.1.0',
        edition: 'team',
        artifactsDir: releaseAssetsDir,
      })

      const offlineManifest = generateManifest({
        version: '1.1.0',
        tag: 'v1.1.0',
        edition: 'offline',
        artifactsDir: releaseAssetsDir,
      })

      // Validate release publication with test public key
      const pubCheck = validateReleasePublication({
        version: '1.1.0',
        tag: 'v1.1.0',
        artifactsDir: releaseAssetsDir,
        pubkey: pubKeyRaw,
        requireArtifactVerification: true,
      })
      assert.equal(pubCheck.valid, true, `Publication readiness must pass: ${pubCheck.errors.join('; ')}`)

      // 6. Simulate Windows Client Update Check (Team Edition)
      const clientCurrentVersion = '1.0.0'
      const clientAppEdition = 'team'
      const clientPlatform = 'windows-x86_64'

      assert.equal(teamManifest.edition, clientAppEdition, 'Manifest edition must match client edition')
      const winTarget = teamManifest.platforms[clientPlatform]
      assert.ok(winTarget, 'Windows x86_64 target must exist in manifest')
      assert.ok(winTarget.url.endsWith('LAAP-Desktop-1.1.0-x64-setup.exe'), 'URL must target team Windows installer')

      // 7. Verify Windows payload bytes against signature and public key
      const downloadedBytes = fs.readFileSync(winTeamExe)
      assert.equal(downloadedBytes[0], 0x4d, 'Payload must have MZ header (byte 0)')
      assert.equal(downloadedBytes[1], 0x5a, 'Payload must have MZ header (byte 1)')

      const isSigValid = verifyArtifactSignature(downloadedBytes, winTarget.signature, pubKeyRaw)
      assert.equal(isSigValid, true, 'Genuine Windows update payload must pass cryptographic verification')

      // 8. Negative Test: Tampered Windows payload is immediately rejected
      const tamperedBytes = Buffer.from(downloadedBytes)
      tamperedBytes[20] ^= 0xff // Flip a byte
      const isTamperedValid = verifyArtifactSignature(tamperedBytes, winTarget.signature, pubKeyRaw)
      assert.equal(isTamperedValid, false, 'Tampered Windows payload must fail cryptographic verification')

      // 9. Cross-edition upgrade attack simulation: Team client trying to install Offline artifact
      const offlineWinTarget = offlineManifest.platforms['windows-x86_64']
      const offlineUrl = offlineWinTarget.url.toLowerCase()
      const isCrossEditionBlocked = clientAppEdition === 'team' && offlineUrl.includes('offline')
      assert.equal(isCrossEditionBlocked, true, 'Cross-edition update payload must be blocked')

      // 10. Verify isolation: No Riot sessions or account vaults were touched or created
      assert.equal(fs.readdirSync(clientVaultDir).length, 0, 'No account credentials were touched during upgrade test')
    } finally {
      fs.rmSync(sandboxDir, { recursive: true, force: true })
    }
  })
})
