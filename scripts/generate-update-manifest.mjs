#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

/**
 * Generates an official Tauri 2 updater manifest (latest-team.json or latest-offline.json)
 * from actual build artifacts and their corresponding .sig signature files.
 *
 * Enforces:
 * 1. Exact platform-target key mapping (windows-x86_64, darwin-x86_64, darwin-aarch64, darwin-universal)
 * 2. Real signature embedding (reads .sig content, does not use URL)
 * 3. Edition tag embedding (enforcing team vs offline isolation)
 * 4. Strict manifest validation before output is written
 */

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

    // Skip .sig files themselves
    if (lower.endsWith('.sig') || lower.endsWith('.json')) continue

    // Edition filter check
    const isOfflineAsset = lower.includes('offline')
    if (edition === 'offline' && !isOfflineAsset && !lower.includes('darwin')) {
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

export function validateManifest(manifest) {
  const errors = []

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

  for (const [key, entry] of Object.entries(manifest.platforms || {})) {
    if (!['windows-x86_64', 'windows-aarch64', 'darwin-x86_64', 'darwin-aarch64', 'darwin-universal'].includes(key)) {
      errors.push(`Unrecognized platform key: "${key}"`)
    }
    if (!entry.url || !entry.url.startsWith('https://')) {
      errors.push(`Insecure or missing URL for platform "${key}": "${entry.url}"`)
    }
    if (!entry.signature || entry.signature.trim().length < 32) {
      errors.push(`Missing or invalid cryptographic signature for platform "${key}"`)
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

  try {
    const manifest = generateManifest({
      version,
      tag,
      edition,
      artifactsDir,
      notes,
    })

    const validation = validateManifest(manifest)
    if (!validation.valid) {
      console.error('Manifest validation errors:', validation.errors.join('\n'))
      process.exit(1)
    }

    fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2), 'utf8')
    console.log(`Successfully generated and validated ${outputFile} for ${edition} v${version}`)
  } catch (err) {
    console.error('Failed to generate update manifest:', err)
    process.exit(1)
  }
}
