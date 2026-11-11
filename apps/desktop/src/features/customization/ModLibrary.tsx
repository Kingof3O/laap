import { readFileBase64 } from './packageFiles'
import { useEffect, useState, type FormEvent } from 'react'
import { invokeTauri } from '../../lib/api'
import { errorMessage, mods, gamePath, type ConflictReport, type FantomeEntry, type FantomeMeta } from './api'

interface AssetEntry {
  relativePath: string
  sha256: string
  sizeBytes: number
}

interface PackageRecord {
  archiveBytes: number
  manifest: {
    displayName: string
    version: string
    author: string
    license: string
    sha256: string
    files: AssetEntry[]
  }
}

export function ModLibrary() {
  const [packages, setPackages] = useState<PackageRecord[] | null>(null)
  const [archive, setArchive] = useState<File>()
  const [manifest, setManifest] = useState<File>()
  const [detectedFormat, setDetectedFormat] = useState<string>('')
  const [fantomeMeta, setFantomeMeta] = useState<FantomeMeta | null>(null)
  const [archiveEntries, setArchiveEntries] = useState<FantomeEntry[] | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [removing, setRemoving] = useState('')
  const [formKey, setFormKey] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')

  // Conflict and staging state
  const [conflicts, setConflicts] = useState<ConflictReport | null>(null)
  const [gameDir, setGameDir] = useState<string>('')
  const [stagingReport, setStagingReport] = useState<string>('')

  async function load() {
    try {
      setPackages(await invokeTauri<PackageRecord[]>('mod_list'))
      setConflicts(await mods.conflicts())
      const pathCfg = await gamePath.get()
      if (pathCfg.leaguePath) setGameDir(pathCfg.leaguePath)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  useEffect(() => { void load() }, [])

  async function onArchiveSelected(file: File | undefined) {
    setArchive(file)
    setDetectedFormat('')
    setFantomeMeta(null)
    setArchiveEntries(null)
    if (!file) return

    try {
      const b64 = await readFileBase64(file)
      const format = await mods.detectFormat(b64)
      setDetectedFormat(format)

      // Try reading contents
      try {
        const entries = await mods.listContents(b64)
        setArchiveEntries(entries)
      } catch {
        // Not a standard zip
      }

      // If Fantome, read metadata automatically
      if (format === 'Fantome') {
        try {
          const meta = await mods.readMeta(b64)
          setFantomeMeta(meta)
          setStatus(`Detected Fantome package: "${meta.name}" by ${meta.author}.`)
        } catch {
          // No META/info.json
        }
      }
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault()
    if (!archive || (!manifest && !fantomeMeta) || !confirmed) return
    setError('')
    setStatus('')
    if (archive.size > 32 * 1024 * 1024) {
      setError('Choose an archive up to 32 MiB.')
      return
    }
    setBusy(true)
    try {
      const archiveB64 = await readFileBase64(archive)

      let manifestObj: unknown
      if (manifest) {
        manifestObj = JSON.parse(await manifest.text())
      } else if (fantomeMeta) {
        // Auto-generate manifest from Fantome metadata
        manifestObj = {
          schemaVersion: 1,
          modId: (fantomeMeta.targetChampion ?? 'custom') + '.' + fantomeMeta.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          version: fantomeMeta.version || '1.0.0',
          displayName: fantomeMeta.name,
          author: fantomeMeta.author || 'Community Creator',
          license: 'Community-Mod',
          rightToDistribute: true,
          containsPaidRiotContent: false,
          sha256: '', // native validator computes SHA-256
          files: (archiveEntries ?? []).map((e) => ({
            relativePath: e.relativePath,
            sha256: '0'.repeat(64),
            sizeBytes: e.sizeBytes,
          })),
        }
      }

      await invokeTauri('mod_import', {
        archive: archiveB64,
        manifest: manifestObj,
        rightsConfirmed: confirmed,
      })
      setStatus('Package validated and imported successfully.')
      setArchive(undefined)
      setManifest(undefined)
      setDetectedFormat('')
      setFantomeMeta(null)
      setArchiveEntries(null)
      setConfirmed(false)
      setFormKey((key) => key + 1)
      await load()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function remove(hash: string) {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await invokeTauri('mod_remove', { hash })
      setRemoving('')
      setStatus('Removed the local library copy.')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      await load()
      setBusy(false)
    }
  }

  async function stageMods() {
    setBusy(true)
    setError('')
    setStagingReport('')
    try {
      const rep = await mods.stageOverlay(gameDir || null)
      setStagingReport(rep.message)
      if (rep.skippedOrFailedMods.length > 0) {
        setError(`Some mods had extraction issues: ${rep.skippedOrFailedMods.join('; ')}`)
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function rollbackMods() {
    setBusy(true)
    setError('')
    setStagingReport('')
    try {
      const rep = await mods.rollback(gameDir || null)
      setStagingReport(rep.message)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function detectGamePath() {
    setBusy(true)
    try {
      const detected = await gamePath.detect()
      if (detected) {
        setGameDir(detected)
        await gamePath.set(detected)
        setStatus(`Detected League directory: ${detected}`)
      } else {
        setStatus('Could not auto-detect League installation. Please enter path manually.')
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const filteredPackages = packages?.filter(({ manifest: item }) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return item.displayName.toLowerCase().includes(q) ||
      item.author.toLowerCase().includes(q) ||
      item.license.toLowerCase().includes(q)
  })

  return (
    <>
      <div className="customization-heading">
        <div>
          <h2>Mod manager & library</h2>
          <p>Import, inspect, and manage custom packages (.fantome, .modpkg, image archives).</p>
        </div>
      </div>

      {conflicts?.hasConflicts && (
        <div className="customization-card" style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.4)', padding: '0.875rem 1rem', marginBottom: '1rem', borderRadius: '8px' }}>
          <strong style={{ color: '#ef4444' }}>⚠️ Mod File Overlaps Detected</strong>
          <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>Multiple mods target the same file paths in the game asset hierarchy:</p>
          <ul style={{ margin: '0.25rem 0 0 1rem', fontSize: '0.85rem' }}>
            {conflicts.conflicts.map((c, i) => (
              <li key={i}><code>{c.relativePath}</code>: {c.conflictingMods.join(', ')}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Game Path & Overlay Staging */}
      <section className="customization-editor" style={{ marginBottom: '1.5rem' }}>
        <h3>Mod staging & rollback</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>Stage enabled mods into LAAP's managed staging sandbox or the configured League overlay directory. Base game files remain untouched.</p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ flex: 1, margin: 0 }}>League directory (optional for overlay sandbox)
            <input type="text" placeholder="C:\Riot Games\League of Legends\Game" value={gameDir} onChange={(e) => setGameDir(e.target.value)} />
          </label>
          <button type="button" className="btn-secondary" style={{ marginTop: '1.4rem' }} disabled={busy} onClick={() => void detectGamePath()}>Detect path</button>
        </div>
        <div className="customization-actions" style={{ marginTop: '0.75rem' }}>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void stageMods()}>Stage mod overlay</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void rollbackMods()}>Rollback overlay</button>
        </div>
        {stagingReport && <p role="status" style={{ color: '#10b981', marginTop: '0.5rem' }}>{stagingReport}</p>}
      </section>

      {/* Import Form */}
      <form key={formKey} className="customization-editor" onSubmit={(event) => void add(event)}>
        <h3>Import custom mod package</h3>
        <label>Archive file (.zip, .fantome, .modpkg)
          <input type="file" required accept=".zip,.modpkg,.fantome" disabled={busy} onChange={(event) => void onArchiveSelected(event.target.files?.[0])} />
        </label>
        {detectedFormat && (
          <p style={{ fontSize: '0.85rem' }}>Detected Format: <strong>{detectedFormat}</strong> {archiveEntries ? `(${archiveEntries.length} files inside)` : ''}</p>
        )}

        {!fantomeMeta && (
          <label>LAAP manifest JSON (optional if .fantome metadata is detected)
            <input type="file" accept=".json" disabled={busy} onChange={(event) => setManifest(event.target.files?.[0])} />
          </label>
        )}

        {archiveEntries && archiveEntries.length > 0 && (
          <details style={{ margin: '0.5rem 0' }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.9rem' }}>Preview package contents ({archiveEntries.length} files)</summary>
            <ul style={{ maxHeight: '160px', overflowY: 'auto', fontSize: '0.8rem', paddingLeft: '1.25rem', marginTop: '0.5rem' }}>
              {archiveEntries.map((e, idx) => (
                <li key={idx}><code>{e.relativePath}</code> ({e.formatType}, {Math.ceil(e.sizeBytes / 1024)} KiB)</li>
              ))}
            </ul>
          </details>
        )}

        <label className="customization-check">
          <input type="checkbox" required checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />
          I confirm I have permission to use these assets and the package contains no paid Riot content or executables.
        </label>
        <button className="btn-primary" disabled={busy || !archive || (!manifest && !fantomeMeta) || !confirmed}>
          {busy ? 'Validating…' : 'Validate and import'}
        </button>
      </form>

      {error && <p role="alert">{error} {!packages && <button className="btn-secondary" onClick={() => { setError(''); void load() }}>Retry library</button>}</p>}
      {status && <p role="status">{status}</p>}
      {!packages && !error && <p role="status">Loading library…</p>}

      {packages && packages.length > 0 && (
        <div className="customization-filters" style={{ marginTop: '1.5rem' }}>
          <label>Filter library <input type="search" placeholder="Search by name, author, or license…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></label>
        </div>
      )}

      {packages?.length === 0 && <p>Your library is empty.</p>}
      {packages && packages.length > 0 && filteredPackages?.length === 0 && <p>No packages match your search filter.</p>}

      <ul className="customization-list">
        {filteredPackages?.map(({ manifest: item, archiveBytes }) => (
          <li key={item.sha256}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{item.displayName} · v{item.version}</strong>
              <span className="badge" style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'var(--surface-border, #334155)', borderRadius: '4px' }}>{Math.ceil(archiveBytes / 1024)} KiB</span>
            </div>
            <span>{item.author} · {item.license}</span>
            <details style={{ marginTop: '0.5rem' }}>
              <summary>Inspect {item.files.length} package files</summary>
              <p className="customization-source">SHA-256: <code>{item.sha256}</code></p>
              <ul style={{ maxHeight: '180px', overflowY: 'auto', fontSize: '0.85rem' }}>
                {item.files.map((asset) => (
                  <li key={asset.relativePath}>{asset.relativePath} · {asset.sizeBytes} bytes</li>
                ))}
              </ul>
            </details>
            <div className="customization-actions" style={{ marginTop: '0.75rem' }}>
              {removing === item.sha256 ? <>
                <button className="btn-secondary" disabled={busy} onClick={() => void remove(item.sha256)}>Confirm removal</button>
                <button className="btn-secondary" disabled={busy} onClick={() => setRemoving('')}>Cancel</button>
              </> : <button className="btn-secondary" disabled={busy} onClick={() => setRemoving(item.sha256)}>Remove library copy</button>}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
