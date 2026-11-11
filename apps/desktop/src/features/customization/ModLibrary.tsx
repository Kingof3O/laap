import { readFileBase64 } from './packageFiles'
import { useEffect, useState, type FormEvent, type DragEvent } from 'react'
import { invokeTauri, hasTauri } from '../../lib/api'
import { errorMessage, mods, type ConflictReport, type FantomeEntry, type FantomeMeta } from './api'

interface AssetEntry {
  relativePath: string
  sha256: string
  sizeBytes: number
}

interface PackageManifest {
  modId: string
  displayName: string
  version: string
  author: string
  license: string
  sha256: string
  files: AssetEntry[]
  rightToDistribute?: boolean
  containsPaidRiotContent?: boolean
  notes?: string
}

interface InstalledModRecord {
  archiveBytes: number
  enabled: boolean
  priority: number
  format: string
  manifest: PackageManifest
}

function downloadBase64(base64: string, mimeType: string, filename: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 15_000)
}

export function ModLibrary() {
  const [packages, setPackages] = useState<InstalledModRecord[] | null>(null)
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
  const [isDragOver, setIsDragOver] = useState(false)

  // Selection & Batch Operations State
  const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set())
  const [batchRemoving, setBatchRemoving] = useState(false)

  // Conflict and staging state
  const [conflicts, setConflicts] = useState<ConflictReport | null>(null)
  const [assetName, setAssetName] = useState('')
  const [assetAuthor, setAssetAuthor] = useState('')
  const [assetLicense, setAssetLicense] = useState('')
  const [redistributable, setRedistributable] = useState(false)
  const [stagingReport, setStagingReport] = useState<string>('')

  async function load() {
    try {
      const list = await invokeTauri<InstalledModRecord[]>('mod_list')
      // Sort by priority descending, then by name
      list.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.manifest.displayName.localeCompare(b.manifest.displayName))
      setPackages(list)
      setConflicts(await mods.conflicts())
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

      try {
        const entries = await mods.listContents(b64)
        setArchiveEntries(entries)
      } catch {
        // Not a standard zip
      }

      if (format.toLowerCase() === 'fantome') {
        try {
          const meta = await mods.readMeta(b64)
          setFantomeMeta(meta)
          setAssetName(meta.name)
          setAssetAuthor(meta.author)
          setStatus(`Detected Fantome package: "${meta.name}" by ${meta.author}.`)
        } catch {
          // No META/info.json
        }
      }
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      void onArchiveSelected(file)
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault()
    if (!archive || (!manifest && (!assetName || !assetAuthor || !assetLicense)) || !confirmed) return
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
      } else {
        manifestObj = await invokeTauri('mod_inspect', { archive: archiveB64, declaration: {
          displayName: assetName, author: assetAuthor, version: fantomeMeta?.version || '1.0.0',
          license: assetLicense, rightToDistribute: redistributable, containsPaidRiotContent: false,
        } })
      }

      await invokeTauri('mod_import', {
        archive: archiveB64,
        manifest: manifestObj,
        rightsConfirmed: confirmed,
      })
      setStatus('Package validated and imported successfully into local Mod Library.')
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
      setSelectedHashes((prev) => {
        const next = new Set(prev)
        next.delete(hash)
        return next
      })
      setStatus('Removed the local library copy.')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      await load()
      setBusy(false)
    }
  }

  async function toggleModEnabled(hash: string, currentEnabled: boolean) {
    setBusy(true)
    setError('')
    try {
      await mods.setEnabled(hash, !currentEnabled)
      await load()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function updateModPriority(hash: string, newPriority: number) {
    setBusy(true)
    setError('')
    try {
      await mods.setPriority(hash, Math.max(0, newPriority))
      await load()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function exportModPackage(item: InstalledModRecord) {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const data = await mods.getPackageData(item.manifest.sha256)
      if (hasTauri) {
        try {
          const saved = await invokeTauri<boolean>('creator_save_package', {
            archive: data.archiveBase64,
            manifest: item.manifest,
            kind: 'zip',
          })
          if (saved) {
            setStatus(`Exported "${item.manifest.displayName}" successfully.`)
            return
          }
        } catch {
          // Fallback to browser blob download
        }
      }
      downloadBase64(
        data.archiveBase64,
        'application/zip',
        `${item.manifest.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_v${item.manifest.version}.zip`
      )
      setStatus(`Exported "${item.manifest.displayName}" as archive.`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  // Batch operations
  function toggleSelectAll() {
    if (!packages) return
    if (selectedHashes.size === packages.length) {
      setSelectedHashes(new Set())
    } else {
      setSelectedHashes(new Set(packages.map((p) => p.manifest.sha256)))
    }
  }

  function toggleSelectOne(hash: string) {
    setSelectedHashes((prev) => {
      const next = new Set(prev)
      if (next.has(hash)) next.delete(hash)
      else next.add(hash)
      return next
    })
  }

  async function executeBatchSetEnabled(enabled: boolean) {
    if (selectedHashes.size === 0) return
    setBusy(true)
    setError('')
    try {
      for (const hash of selectedHashes) {
        await mods.setEnabled(hash, enabled)
      }
      setStatus(`${enabled ? 'Enabled' : 'Disabled'} ${selectedHashes.size} selected mod(s).`)
      await load()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function executeBatchDelete() {
    if (selectedHashes.size === 0) return
    setBusy(true)
    setError('')
    try {
      for (const hash of selectedHashes) {
        await invokeTauri('mod_remove', { hash })
      }
      setStatus(`Removed ${selectedHashes.size} selected mod(s).`)
      setSelectedHashes(new Set())
      setBatchRemoving(false)
      await load()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function stageMods() {
    setBusy(true)
    setError('')
    setStagingReport('')
    try {
      const rep = await mods.stageOverlay()
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
      const rep = await mods.rollback()
      setStagingReport(rep.message)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const filteredPackages = packages?.filter((item) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return item.manifest.displayName.toLowerCase().includes(q) ||
      item.manifest.author.toLowerCase().includes(q) ||
      item.manifest.license.toLowerCase().includes(q) ||
      (item.format && item.format.toLowerCase().includes(q))
  })

  return (
    <>
      <div className="customization-heading">
        <div>
          <h2>Mod Manager & Library</h2>
          <p>Import, order priorities, inspect virtual file conflicts, and stage verified custom packages (.fantome, .modpkg, .zip).</p>
        </div>
      </div>

      {conflicts?.hasConflicts && (
        <div className="customization-card" style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.4)', padding: '1rem', marginBottom: '1.25rem', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ color: '#ef4444' }}>⚠️ Mod File Overlaps Detected ({conflicts.conflicts.length})</strong>
            <span style={{ fontSize: '0.8rem', color: '#fca5a5' }}>Higher priority mods override lower priority mods for overlapping files.</span>
          </div>
          <p style={{ margin: '0.35rem 0', fontSize: '0.875rem' }}>Multiple enabled mods target identical asset paths in the game asset hierarchy:</p>
          <div style={{ display: 'grid', gap: '6px', maxHeight: '180px', overflowY: 'auto', marginTop: '0.5rem' }}>
            {conflicts.conflicts.map((c, i) => (
              <div key={i} style={{ padding: '6px 10px', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', fontSize: '0.825rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <code style={{ color: '#fca5a5' }}>{c.relativePath}</code>
                  <span style={{ marginLeft: '8px', color: 'var(--text-secondary)' }}>Competing: {c.conflictingMods.join(', ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Game Path & Overlay Staging */}
      <section className="customization-editor" style={{ marginBottom: '1.5rem', maxWidth: '100%' }}>
        <div className="customization-card" style={{ padding: '1rem 1.25rem', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ fontSize: '1rem' }}>Local Sandbox Staging</strong>
              <p style={{ margin: '0.25rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Stage active verified mod files in LAAP's sandbox. No League game installation files are modified and Vanguard integrity is protected.
              </p>
            </div>
            <div className="customization-actions" style={{ margin: 0 }}>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void stageMods()}>
                Stage in LAAP Sandbox
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => void rollbackMods()}>
                Clear Owned Staging
              </button>
            </div>
          </div>
          {stagingReport && <p role="status" style={{ color: '#10b981', marginTop: '0.5rem', fontSize: '0.875rem' }}>{stagingReport}</p>}
        </div>
      </section>

      {/* Import Form with Drag-and-Drop Dropzone */}
      <form key={formKey} className="customization-editor" style={{ maxWidth: '100%', marginBottom: '1.5rem' }} onSubmit={(event) => void add(event)}>
        <div
          className="customization-card"
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          style={{
            padding: '1.25rem',
            borderRadius: '8px',
            border: isDragOver ? '2px dashed var(--accent, #6366f1)' : '1px solid var(--border-subtle, #5a476c)',
            background: isDragOver ? 'rgba(99, 102, 241, 0.08)' : 'var(--surface-2, #2b213a)',
            transition: 'border-color 0.2s, background 0.2s',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Import Custom Mod Package</h3>
            {isDragOver && <span style={{ color: 'var(--accent, #6366f1)', fontWeight: 600 }}>Drop file to import</span>}
          </div>
          <p style={{ margin: '0.25rem 0 1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Drag & drop or select an archive file (.zip, .fantome, .modpkg). Metadata is inspected automatically.
          </p>

          <label>Archive file (.zip, .fantome, .modpkg)
            <input type="file" required accept=".zip,.modpkg,.fantome" disabled={busy} onChange={(event) => void onArchiveSelected(event.target.files?.[0])} />
          </label>
          {detectedFormat && (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-accent-400, #a78bfa)' }}>
              Detected Format: <strong>{detectedFormat.toUpperCase()}</strong> {archiveEntries ? `(${archiveEntries.length} files inside)` : ''}
            </p>
          )}

          <label style={{ marginTop: '0.5rem' }}>LAAP manifest JSON (optional)
            <input type="file" accept=".json" disabled={busy} onChange={(event) => setManifest(event.target.files?.[0])} />
          </label>
          {!manifest && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
              <label>Package name <input required maxLength={160} value={assetName} onChange={e => setAssetName(e.target.value)} /></label>
              <label>Original author <input required maxLength={120} value={assetAuthor} onChange={e => setAssetAuthor(e.target.value)} /></label>
              <label>License or permission <input required maxLength={80} value={assetLicense} onChange={e => setAssetLicense(e.target.value)} /></label>
              <label className="customization-check" style={{ alignSelf: 'center', marginTop: '1.25rem' }}>
                <input type="checkbox" checked={redistributable} onChange={e => setRedistributable(e.target.checked)} />
                License permits redistribution
              </label>
            </div>
          )}

          {archiveEntries && archiveEntries.length > 0 && (
            <details style={{ margin: '0.75rem 0' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.9rem', color: 'var(--color-accent-400)' }}>Preview package contents ({archiveEntries.length} files)</summary>
              <ul style={{ maxHeight: '160px', overflowY: 'auto', fontSize: '0.8rem', paddingLeft: '1.25rem', marginTop: '0.5rem' }}>
                {archiveEntries.map((e, idx) => (
                  <li key={idx}><code>{e.relativePath}</code> ({e.formatType}, {Math.ceil(e.sizeBytes / 1024)} KiB)</li>
                ))}
              </ul>
            </details>
          )}

          <label className="customization-check" style={{ marginTop: '0.75rem' }}>
            <input type="checkbox" required checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />
            I confirm I have permission to use these assets and the package contains no paid Riot content, cheats, or executables.
          </label>

          <div className="customization-actions" style={{ marginTop: '0.75rem' }}>
            <button className="btn-primary" disabled={busy || !archive || (!manifest && (!assetName || !assetAuthor || !assetLicense)) || !confirmed}>
              {busy ? 'Validating…' : 'Validate and Import Package'}
            </button>
          </div>
        </div>
      </form>

      {error && <p role="alert">{error} {!packages && <button className="btn-secondary" onClick={() => { setError(''); void load() }}>Retry library</button>}</p>}
      {status && <p role="status" style={{ color: '#10b981' }}>{status}</p>}
      {!packages && !error && <p role="status">Loading library…</p>}

      {/* Library Toolbar & Batch Operations */}
      {packages && packages.length > 0 && (
        <div className="customization-card" style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label className="customization-check" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={packages.length > 0 && selectedHashes.size === packages.length}
                  onChange={toggleSelectAll}
                />
                <span style={{ fontSize: '0.875rem' }}>
                  {selectedHashes.size > 0 ? `${selectedHashes.size} Selected` : 'Select All'}
                </span>
              </label>

              {selectedHashes.size > 0 && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="button" className="btn-secondary" style={{ padding: '3px 10px', fontSize: '0.8rem' }} disabled={busy} onClick={() => void executeBatchSetEnabled(true)}>
                    Enable Selected
                  </button>
                  <button type="button" className="btn-secondary" style={{ padding: '3px 10px', fontSize: '0.8rem' }} disabled={busy} onClick={() => void executeBatchSetEnabled(false)}>
                    Disable Selected
                  </button>
                  {batchRemoving ? (
                    <>
                      <button type="button" className="btn-secondary" style={{ padding: '3px 10px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }} disabled={busy} onClick={() => void executeBatchDelete()}>
                        Confirm Delete ({selectedHashes.size})
                      </button>
                      <button type="button" className="btn-secondary" style={{ padding: '3px 10px', fontSize: '0.8rem' }} onClick={() => setBatchRemoving(false)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn-secondary" style={{ padding: '3px 10px', fontSize: '0.8rem' }} disabled={busy} onClick={() => setBatchRemoving(true)}>
                      Delete Selected…
                    </button>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="search"
                placeholder="Search mods by name, author, format…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ minWidth: '260px' }}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {filteredPackages?.length} of {packages.length}
              </span>
            </div>
          </div>
        </div>
      )}

      {packages?.length === 0 && <p>Your mod library is empty. Import a .fantome or .modpkg package above to get started.</p>}
      {packages && packages.length > 0 && filteredPackages?.length === 0 && <p>No packages match your search filter.</p>}

      {/* Mod Cards List */}
      <ul className="customization-list">
        {filteredPackages?.map((item) => {
          const isSelected = selectedHashes.has(item.manifest.sha256)
          return (
            <li
              key={item.manifest.sha256}
              style={{
                borderLeft: item.enabled ? '4px solid #10b981' : '4px solid #4b5563',
                opacity: item.enabled ? 1 : 0.7,
                transition: 'opacity 0.15s, border-color 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectOne(item.manifest.sha256)}
                  />
                  <div>
                    <strong style={{ fontSize: '1.05rem' }}>{item.manifest.displayName}</strong>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                      v{item.manifest.version} by {item.manifest.author}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    className="badge"
                    style={{
                      fontSize: '0.75rem',
                      padding: '2px 8px',
                      background: 'var(--surface-border, #334155)',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {item.format || 'ZIP'}
                  </span>
                  <span
                    className="badge"
                    style={{
                      fontSize: '0.75rem',
                      padding: '2px 8px',
                      background: 'var(--surface-border, #334155)',
                      borderRadius: '4px',
                    }}
                  >
                    {Math.ceil(item.archiveBytes / 1024)} KiB
                  </span>
                  <button
                    type="button"
                    className={item.enabled ? 'btn-primary' : 'btn-secondary'}
                    style={{
                      padding: '3px 12px',
                      fontSize: '0.8rem',
                      background: item.enabled ? '#10b981' : undefined,
                      borderColor: item.enabled ? '#10b981' : undefined,
                    }}
                    disabled={busy}
                    onClick={() => void toggleModEnabled(item.manifest.sha256, item.enabled)}
                  >
                    {item.enabled ? '✓ Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span>License: {item.manifest.license}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Priority Rank:</span>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '1px 6px', fontSize: '0.75rem' }}
                    disabled={busy}
                    onClick={() => void updateModPriority(item.manifest.sha256, (item.priority ?? 0) + 1)}
                    title="Increase priority"
                  >
                    ▲
                  </button>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', minWidth: '18px', textAlign: 'center' }}>
                    {item.priority ?? 0}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '1px 6px', fontSize: '0.75rem' }}
                    disabled={busy || (item.priority ?? 0) <= 0}
                    onClick={() => void updateModPriority(item.manifest.sha256, (item.priority ?? 0) - 1)}
                    title="Decrease priority"
                  >
                    ▼
                  </button>
                </div>
              </div>

              <details style={{ marginTop: '0.25rem' }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-accent-400)' }}>
                  Inspect {item.manifest.files.length} virtual package files
                </summary>
                <p className="customization-source" style={{ margin: '0.5rem 0' }}>
                  SHA-256: <code>{item.manifest.sha256}</code>
                </p>
                <ul style={{ maxHeight: '180px', overflowY: 'auto', fontSize: '0.825rem', paddingLeft: '1.25rem' }}>
                  {item.manifest.files.map((asset) => (
                    <li key={asset.relativePath}>
                      <code>{asset.relativePath}</code> · {Math.ceil(asset.sizeBytes / 1024)} KiB
                    </li>
                  ))}
                </ul>
              </details>

              <div className="customization-actions" style={{ marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => void exportModPackage(item)}
                >
                  Export Package (.zip)
                </button>
                {removing === item.manifest.sha256 ? (
                  <>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                      disabled={busy}
                      onClick={() => void remove(item.manifest.sha256)}
                    >
                      Confirm Removal
                    </button>
                    <button type="button" className="btn-secondary" disabled={busy} onClick={() => setRemoving('')}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => setRemoving(item.manifest.sha256)}
                  >
                    Remove Library Copy
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
