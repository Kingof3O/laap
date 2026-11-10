#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

/**
 * Pinned official public key for Minisign / Ed25519 signature verification.
 * Matches apps/desktop/src-tauri/tauri.conf.json and tauri.offline.conf.json
 */
export const DEFAULT_UPDATER_PUBKEY =
  'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDUzNDM5QzAzQjE1NzQxRjUKUldTY2JicXRCSnBnU0lrcnI3Vk1YTUw0TG1uWmVJNXcxTEtYQXB3QnNXU2s3T0tKWHoxV0h5OHMK'

/**
 * Extracts 32 raw bytes of Ed25519 public key from Minisign or raw base64 string
 */
export function parseMinisignPublicKey(pubkeyStr) {
  let text = pubkeyStr.trim()
  if (!text.includes('\n')) {
    try {
      const decoded = Buffer.from(text, 'base64').toString('utf8')
      if (decoded.includes('untrusted comment')) text = decoded
    } catch {}
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const keyLine =
    lines.find(
      (l) => !l.startsWith('untrusted comment') && !l.startsWith('trusted comment'),
    ) || lines[lines.length - 1]

  const keyBuf = Buffer.from(keyLine, 'base64')
  if (keyBuf.length === 32) return keyBuf
  if (keyBuf.length === 42) return keyBuf.subarray(10) // 2-byte algo + 8-byte key ID + 32-byte pubkey
  throw new Error(`Unrecognized public key buffer length: ${keyBuf.length}`)
}

/**
 * Cryptographically verifies an artifact's Ed25519/Minisign signature.
 * Returns true if valid, false if signature does not authenticate the bytes.
 */
export function verifyArtifactSignature(fileBytes, signatureStr, pubKeyInput = DEFAULT_UPDATER_PUBKEY) {
  try {
    const rawPubBytes =
      Buffer.isBuffer(pubKeyInput) && pubKeyInput.length === 32
        ? pubKeyInput
        : parseMinisignPublicKey(pubKeyInput)

    const derPrefix = Buffer.from('302a300506032b6570032100', 'hex')
    const pubKeyObject = crypto.createPublicKey({
      key: Buffer.concat([derPrefix, rawPubBytes]),
      format: 'der',
      type: 'spki',
    })

    let text = signatureStr.trim()
    if (!text.includes('\n')) {
      try {
        const decoded = Buffer.from(text, 'base64').toString('utf8')
        if (decoded.includes('untrusted comment')) text = decoded
      } catch {}
    }

    let sigBytes
    let isPrehashed = false

    if (text.includes('\n')) {
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      const sigLine =
        lines.find(
          (l) => !l.startsWith('untrusted comment') && !l.startsWith('trusted comment'),
        ) || lines[1]
      const sigBuf = Buffer.from(sigLine, 'base64')
      const algo = sigBuf.subarray(0, 2).toString('utf8')
      isPrehashed = algo === 'ED'
      sigBytes = sigBuf.length >= 74 ? sigBuf.subarray(10, 74) : sigBuf
    } else {
      sigBytes = Buffer.from(text, 'base64')
    }

    const dataToVerify = isPrehashed
      ? crypto.createHash('blake2b512').update(fileBytes).digest()
      : fileBytes

    return crypto.verify(null, dataToVerify, pubKeyObject, sigBytes)
  } catch {
    return false
  }
}

export function parseCliArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
      args[key] = value
    }
  }
  return args
}

export function generateManifest(options) {
  const {
    version,
    tag,
    edition,
    artifactsDir,
    notes = 'LAAP Desktop release update.',
    repo = 'Kingof3O/laap',
    pubDate = new Date().toISOString(),
  } = options

  if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(`Invalid semver version: ${version}`)
  }

  if (edition !== 'team' && edition !== 'offline') {
    throw new Error(`Invalid edition: ${edition}. Expected 'team' or 'offline'.`)
  }

  const platforms = {}

  if (!fs.existsSync(artifactsDir)) {
    throw new Error(`Artifacts directory does not exist: ${artifactsDir}`)
  }

  // Scan files in artifacts directory (and subdirectories)
  const files = []
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        scan(fullPath)
      } else {
        files.push(fullPath)
      }
    }
  }
  scan(artifactsDir)

  // Helper to read signature file
  function readSignature(assetPath) {
    const sigCandidates = [
      `${assetPath}.sig`,
      assetPath.replace(/\.zip$/, '.zip.sig'),
      assetPath.replace(/\.tar\.gz$/, '.tar.gz.sig'),
      assetPath.replace(/\.exe$/, '.exe.sig'),
    ]
    for (const sigPath of sigCandidates) {
      if (fs.existsSync(sigPath)) {
        return fs.readFileSync(sigPath, 'utf8').trim()
      }
    }
    return null
  }

  // Map artifacts to Tauri platform keys
  for (const file of files) {
    const filename = path.basename(file)
    const lower = filename.toLowerCase()

    // Skip .sig and .json files
    if (lower.endsWith('.sig') || lower.endsWith('.json')) continue

    // Strict Edition Filtering:
    // Offline assets MUST contain 'offline' (case-insensitive) in the filename.
    // Team assets MUST NOT contain 'offline' in the filename.
    const isOfflineAsset = lower.includes('offline')
    if (edition === 'offline' && !isOfflineAsset) {
      continue
    }
    if (edition === 'team' && isOfflineAsset) {
      continue
    }

    // Windows x86_64 updater bundle (.nsis.zip or standalone signed installer)
    if (lower.includes('x64') || lower.includes('x86_64') || lower.endsWith('.exe') || lower.endsWith('.nsis.zip')) {
      if (lower.endsWith('.nsis.zip') || lower.endsWith('.zip') || lower.endsWith('.exe')) {
        const sig = readSignature(file)
        if (sig) {
          const downloadUrl = `https://github.com/${repo}/releases/download/${tag}/${filename}`
          platforms['windows-x86_64'] = {
            signature: sig,
            url: downloadUrl,
          }
        }
      }
    }

    // macOS Universal / Apple Silicon / Intel
    if (lower.endsWith('.tar.gz') || lower.endsWith('.app.tar.gz')) {
      const sig = readSignature(file)
      if (sig) {
        const downloadUrl = `https://github.com/${repo}/releases/download/${tag}/${filename}`
        if (lower.includes('universal') || lower.includes('darwin-universal')) {
          platforms['darwin-universal'] = { signature: sig, url: downloadUrl }
          platforms['darwin-x86_64'] = { signature: sig, url: downloadUrl }
          platforms['darwin-aarch64'] = { signature: sig, url: downloadUrl }
        } else if (lower.includes('aarch64') || lower.includes('arm64')) {
          platforms['darwin-aarch64'] = { signature: sig, url: downloadUrl }
        } else if (lower.includes('x86_64') || lower.includes('x64')) {
          platforms['darwin-x86_64'] = { signature: sig, url: downloadUrl }
        }
      }
    }
  }

  const manifest = {
    version: version.trim().replace(/^v/, ''),
    notes,
    pub_date: pubDate,
    edition,
    platforms,
  }

  return manifest
}

export function validateManifest(manifest, options = {}) {
  const errors = []
  const {
    artifactsDir,
    pubkey = DEFAULT_UPDATER_PUBKEY,
    requireArtifactVerification = false,
  } = options

  if (!manifest.version || !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push(`Manifest version invalid: "${manifest.version}"`)
  }

  if (manifest.edition !== 'team' && manifest.edition !== 'offline') {
    errors.push(`Manifest edition invalid: "${manifest.edition}"`)
  }

  const platformKeys = Object.keys(manifest.platforms || {})
  if (platformKeys.length === 0) {
    errors.push('Manifest platforms map is empty. At least one platform target must be present.')
  }

  // Scan artifacts directory to find files by basename if directory is provided
  const artifactFileMap = new Map()
  if (artifactsDir && fs.existsSync(artifactsDir)) {
    function indexFiles(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          indexFiles(full)
        } else if (!entry.name.endsWith('.sig') && !entry.name.endsWith('.json')) {
          artifactFileMap.set(entry.name, full)
        }
      }
    }
    indexFiles(artifactsDir)
  }

  for (const [key, entry] of Object.entries(manifest.platforms || {})) {
    if (!['windows-x86_64', 'windows-aarch64', 'darwin-x86_64', 'darwin-aarch64', 'darwin-universal'].includes(key)) {
      errors.push(`Unrecognized platform key: "${key}"`)
    }
    if (!entry.url || !entry.url.startsWith('https://')) {
      errors.push(`Insecure or missing URL for platform "${key}": "${entry.url}"`)
    }
    if (!entry.signature || entry.signature.trim().length < 32) {
      errors.push(`Missing or invalid cryptographic signature for platform "${key}"`)
      continue
    }

    // Cryptographic signature verification against actual artifact file bytes
    const assetFilename = path.basename(new URL(entry.url).pathname)
    const artifactPath = artifactFileMap.get(assetFilename)

    if (artifactPath && fs.existsSync(artifactPath)) {
      const fileBytes = fs.readFileSync(artifactPath)
      const isValid = verifyArtifactSignature(fileBytes, entry.signature, pubkey)
      if (!isValid) {
        errors.push(
          `Cryptographic signature verification FAILED for platform "${key}" asset "${assetFilename}" against pinned updater public key.`
        )
      }
    } else if (requireArtifactVerification) {
      errors.push(
        `Required artifact file "${assetFilename}" for platform "${key}" was not found in artifacts directory for cryptographic verification.`
      )
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// CLI Execution if executed directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const args = parseCliArgs(process.argv)
  const version = args.version || process.env.RELEASE_VERSION || '1.0.0'
  const tag = args.tag || process.env.RELEASE_TAG || `v${version}`
  const edition = args.edition || 'team'
  const artifactsDir = args['artifacts-dir'] || './dist'
  const outputFile = args.output || `./latest-${edition}.json`
  const notes = args.notes || 'LAAP official release update.'
  const pubkey = args.pubkey || process.env.TAURI_UPDATER_PUBKEY || DEFAULT_UPDATER_PUBKEY
  const requireVerification = args['require-verification'] !== 'false'

  try {
    const manifest = generateManifest({
      version,
      tag,
      edition,
      artifactsDir,
      notes,
    })

    const validation = validateManifest(manifest, {
      artifactsDir,
      pubkey,
      requireArtifactVerification: requireVerification,
    })

    if (!validation.valid) {
      console.error('Manifest validation errors:\n - ' + validation.errors.join('\n - '))
      process.exit(1)
    }

    fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2), 'utf8')
    console.log(`Successfully generated and cryptographically verified ${outputFile} for ${edition} v${version}`)
  } catch (err) {
    console.error('Failed to generate update manifest:', err)
    process.exit(1)
  }
}
