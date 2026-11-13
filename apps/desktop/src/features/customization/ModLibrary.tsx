import { readFileBase64 } from './packageFiles'
import { runBatch, type BatchResult } from './batchOperations'
import { useEffect, useRef, useState, type FormEvent, type DragEvent } from 'react'
import { invokeTauri, hasTauri } from '../../lib/api'
import {
  errorMessage,
  gameAdapter,
  mods,
  type AdapterStatusReport,
  type ConflictReport,
  type FantomeEntry,
  type FantomeMeta,
  type GameAdapterConfig,
  type ModRuntimeEntry,
  type ModRuntimeState,
} from './api'
import { adapterStateBadgeColor, formatAdapterStateLabel } from './GameAdapterSettingsPanel'

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

function runtimeBadgeMeta(state: ModRuntimeState): { label: string; background: string } {
  switch (state) {
    case 'applied':
      return { label: 'Applied', background: '#16a34a' }
    case 'adapter-ready':
      return { label: 'Adapter Ready', background: '#2563eb' }
    case 'staged':
      return { label: 'Staged (Sandbox)', background: '#0891b2' }
    case 'deferred':
      return { label: 'Deferred', background: '#d97706' }
    case 'failed':
      return { label: 'Failed', background: '#dc2626' }
    case 'incompatible':
      return { label: 'Incompatible', background: '#991b1b' }
    case 'safe-to-store':
      return { label: 'Safe to Store', background: '#475569' }
    default:
      return { label: 'Unverified', background: '#6b7280' }
  }
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
  const batchController = useRef<AbortController | null>(null)
  const archiveSequence = useRef(0)
  const importController = useRef<AbortController | null>(null)
  const [importPhase, setImportPhase] = useState<'idle' | 'reading' | 'validating' | 'committing'>('idle')
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null)
  const [batchProgress, setBatchProgress] = useState('')
  const [stateFilter, setStateFilter] = useState('all')
  const [batchRemoving, setBatchRemoving] = useState(false)

  // Conflict and staging state
  const [conflicts, setConflicts] = useState<ConflictReport | null>(null)
  const [assetName, setAssetName] = useState('')
  const [assetAuthor, setAssetAuthor] = useState('')
  const [assetLicense, setAssetLicense] = useState('')
  const [redistributable, setRedistributable] = useState(false)
  const [stagingReport, setStagingReport] = useState<string>('')
  const [adapterStatus, setAdapterStatus] = useState<AdapterStatusReport | null>(null)
  const [adapterConfig, setAdapterConfig] = useState<GameAdapterConfig | null>(null)
  const [runtimeMap, setRuntimeMap] = useState<Record<string, ModRuntimeEntry>>({})

  async function refreshAdapterStates() {
    const [probeRes, cfgRes, statesRes] = await Promise.allSettled([
      gameAdapter.probe(),
      gameAdapter.getConfig(),
      gameAdapter.getModStates(),
    ])
    if (probeRes.status === 'fulfilled' && probeRes.value) {
      setAdapterStatus(probeRes.value)
    }
    if (cfgRes.status === 'fulfilled' && cfgRes.value) {
      setAdapterConfig(cfgRes.value)
    }
    if (statesRes.status === 'fulfilled' && Array.isArray(statesRes.value)) {
      const next: Record<string, ModRuntimeEntry> = {}
      for (const entry of statesRes.value) {
        next[entry.sha256] = entry
      }
      setRuntimeMap(next)
    }
  }

  async function load() {
    try {
      const list = await invokeTauri<InstalledModRecord[]>('mod_list')
      // Sort by priority descending, then by name
      list.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.manifest.displayName.localeCompare(b.manifest.displayName))
      setPackages(list)
      setConflicts(await mods.conflicts())
      await refreshAdapterStates()
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  useEffect(() => {
    void load()
    const refresh = () => { void load() }
    window.addEventListener('laap:library-changed', refresh)
    return () => { batchController.current?.abort(); importController.current?.abort(); window.removeEventListener('laap:library-changed', refresh) }
  }, [])

  async function onArchiveSelected(file: File | undefined) {
    if (busy) return
    const sequence = ++archiveSequence.current
    setArchive(file)
    setManifest(undefined)
    setConfirmed(false)
    setAssetName('')
    setAssetAuthor('')
    setAssetLicense('')
    setRedistributable(false)
    setDetectedFormat('')
    setFantomeMeta(null)
    setArchiveEntries(null)
    if (!file) return

    try {
      const b64 = await readFileBase64(file)
      const format = await mods.detectFormat(b64)
      if (sequence !== archiveSequence.current) return
      setDetectedFormat(format)

      try {
        const entries = await mods.listContents(b64)
        if (sequence !== archiveSequence.current) return
        setArchiveEntries(entries)
      } catch {
        // Not a standard zip
      }

      if (format.toLowerCase() === 'fantome') {
        try {
          const meta = await mods.readMeta(b64)
          if (sequence !== archiveSequence.current) return
          setFantomeMeta(meta)
          setAssetName(meta.name)
          setAssetAuthor(meta.author)
          setAssetLicense(meta.license ?? '')
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
    if (busy || importController.current) return
    if (!archive || (!manifest && (!assetName || !assetAuthor || !assetLicense)) || !confirmed) return
    setError('')
    setStatus('')
    if (archive.size > 32 * 1024 * 1024) {
      setError('Choose an archive up to 32 MiB.')
      return
    }
    const controller = new AbortController()
    importController.current = controller
    setBusy(true)
    setImportPhase('reading')
    try {
      const archiveB64 = await readFileBase64(archive, controller.signal, fraction => setStatus(`Reading archive: ${Math.round(fraction * 100)}%`))
      controller.signal.throwIfAborted()
      setImportPhase('validating')
      setStatus('Validating package contents and permissions…')

      let manifestObj: unknown
      if (manifest) {
        if (manifest.size > 1024 * 1024) throw Error('Manifest exceeds 1 MiB.')
        manifestObj = JSON.parse(await manifest.text())
      } else {
        manifestObj = await invokeTauri('mod_inspect', { archive: archiveB64, declaration: {
          displayName: assetName, author: assetAuthor, version: fantomeMeta?.version || '1.0.0',
          license: assetLicense, rightToDistribute: redistributable, containsPaidRiotContent: false,
        } })
      }

      controller.signal.throwIfAborted()
      setImportPhase('committing')
      setStatus('Committing the verified package to the local library…')
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
      setStatus('')
      setError(controller.signal.aborted ? 'Import cancelled before commit. No package was added.' : errorMessage(cause))
    } finally {
      importController.current = null
      setImportPhase('idle')
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
        const saved = await invokeTauri<boolean>('creator_save_package', {
          archive: data.archiveBase64, manifest: item.manifest, kind: 'zip',
        })
        setStatus(saved ? `Exported "${item.manifest.displayName}".` : 'Export cancelled.')
        return
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
    const hashes = filteredPackages?.map(item => item.manifest.sha256) ?? []
    const allSelected = hashes.length > 0 && hashes.every(hash => selectedHashes.has(hash))
    setSelectedHashes(previous => {
      const next = new Set(previous)
      for (const hash of hashes) { if (allSelected) next.delete(hash); else next.add(hash) }
      return next
    })
  }

  function toggleSelectOne(hash: string) {
    setSelectedHashes((prev) => {
      const next = new Set(prev)
      if (next.has(hash)) next.delete(hash)
      else next.add(hash)
      return next
    })
  }

  async function executeBatch(kind: 'enable' | 'disable' | 'remove') {
    if (busy || batchController.current || selectedHashes.size === 0) return
    const controller = new AbortController()
    batchController.current = controller
    setBusy(true)
    setError('')
    setStatus('')
    setBatchResult(null)
    try {
      const result = await runBatch([...selectedHashes], hash => kind === 'remove'
        ? invokeTauri('mod_remove', { hash }) : mods.setEnabled(hash, kind === 'enable'),
        controller.signal, (done, total) => setBatchProgress(`${done} / ${total} processed`))
      setBatchResult(result)
      setSelectedHashes(new Set([...result.failed.map(item => item.id), ...result.cancelled]))
      setBatchRemoving(false)
      setStatus(`${result.succeeded.length} succeeded; ${result.failed.length} failed; ${result.cancelled.length} not started. Failed and unstarted packages remain selected for retry.`)
    } finally {
      await load()
      batchController.current = null
      setBatchProgress('')
      setBusy(false)
    }
  }
  const executeBatchSetEnabled = (enabled: boolean) => executeBatch(enabled ? 'enable' : 'disable')
  const executeBatchDelete = () => executeBatch('remove')

  async function stageMods() {
    setBusy(true)
    setError('')
    setStagingReport('')
    try {
      const rep = await mods.stageOverlay()
      setStagingReport(rep.message)
      if (rep.deferredReason) {
        setStagingReport(`${rep.message} (${rep.deferredReason})`)
      }
      if (rep.skippedOrFailedMods.length > 0) {
        setError(`Some mods could not be activated: ${rep.skippedOrFailedMods.join('; ')}`)
      }
      await refreshAdapterStates()
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
      await refreshAdapterStates()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function validateSingleMod(sha256: string) {
    setBusy(true)
    setError('')
    setStagingReport('')
    try {
      const entry = await gameAdapter.validateMod(sha256)
      setRuntimeMap((prev) => ({ ...prev, [entry.sha256]: entry }))
      setStagingReport(entry.detail)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function applySingleMod(sha256: string) {
    setBusy(true)
    setError('')
    setStagingReport('')
    try {
      const rep = await mods.applySingle(sha256)
      setStagingReport(rep.message)
      if (rep.skippedOrFailedMods.length > 0) {
        setError(`Activation issue: ${rep.skippedOrFailedMods.join('; ')}`)
      }
      await refreshAdapterStates()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const filteredPackages = packages?.filter((item) => {
    if (stateFilter === 'enabled' && !item.enabled || stateFilter === 'disabled' && item.enabled) return false
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
            <span style={{ fontSize: '0.8rem', color: '#fca5a5' }}>Overlapping files block staging. Disable a conflicting package or edit its contents before retrying.</span>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 360px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '1rem' }}>Overlay Staging &amp; External Game Adapter</strong>
                <span
                  data-testid="modlib-adapter-badge"
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    color: '#fff',
                    background: adapterStateBadgeColor(adapterStatus?.state),
                  }}
                >
                  {formatAdapterStateLabel(adapterStatus?.state)}
                </span>
                {adapterStatus?.leagueInstall?.detectedBuild && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Build {adapterStatus.leagueInstall.detectedBuild}
                  </span>
                )}
              </div>
              <p style={{ margin: '0.25rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {adapterStatus?.detail ??
                  'Stage verified custom mods (.fantome, .modpkg, .zip) in LAAP sandbox, and activate them via a verified external adapter configured in Studio Settings.'}
              </p>
            </div>
            <div className="customization-actions" style={{ margin: 0 }}>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void stageMods()}>
                {adapterStatus?.compatible && adapterStatus?.consentGranted && adapterStatus?.clearanceAcknowledged
                  ? 'Apply Enabled Mods'
                  : 'Stage in LAAP Sandbox'}
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => void rollbackMods()}>
                {adapterStatus?.appliedInGame || adapterStatus?.compatible
                  ? 'Rollback & Restore Defaults'
                  : 'Clear Owned Staging'}
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

      {batchProgress && <div role="status">{batchProgress} <button onClick={() => batchController.current?.abort()}>Stop after current package</button></div>}
      {batchResult && batchResult.failed.length > 0 && <section aria-label="Batch failures"><h3>Packages to retry</h3><ul>{batchResult.failed.map(item => <li key={item.id}>{packages?.find(p => p.manifest.sha256 === item.id)?.manifest.displayName ?? item.id}: {item.error}</li>)}</ul></section>}
      {importPhase !== 'idle' && <p role="status">Import: {importPhase}. {importPhase !== 'committing' && <button type="button" onClick={() => importController.current?.abort()}>Cancel before import</button>}</p>}
      {/* Library Toolbar & Batch Operations */}
      {packages && packages.length > 0 && (
        <div className="customization-card" style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label className="customization-check" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={!!filteredPackages?.length && filteredPackages.every(item => selectedHashes.has(item.manifest.sha256))}
                  onChange={toggleSelectAll}
                />
                <span style={{ fontSize: '0.875rem' }}>
                  {selectedHashes.size > 0 ? `${selectedHashes.size} Selected` : 'Select visible packages'}
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
                aria-label="Search mods" placeholder="Search mods by name, author, format…"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSelectedHashes(new Set()); setBatchRemoving(false) }}
                style={{ minWidth: '260px' }}
              />
              <select aria-label="Package state" value={stateFilter} onChange={e => { setStateFilter(e.target.value); setSelectedHashes(new Set()); setBatchRemoving(false) }}><option value="all">All packages</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select>
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
                    aria-label={`Select ${item.manifest.displayName}`}
                    disabled={busy}
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

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {(() => {
                    const fallbackState: ModRuntimeState = item.manifest.containsPaidRiotContent
                      ? 'incompatible'
                      : adapterStatus?.compatible && adapterStatus?.consentGranted && adapterStatus?.clearanceAcknowledged
                        ? 'adapter-ready'
                        : 'safe-to-store'
                    const entry = runtimeMap[item.manifest.sha256]
                    const state = entry?.state ?? fallbackState
                    const meta = runtimeBadgeMeta(state)
                    return (
                      <span
                        data-testid={`mod-runtime-badge-${item.manifest.sha256}`}
                        title={entry?.detail ?? meta.label}
                        className="badge"
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          color: '#fff',
                          background: meta.background,
                          borderRadius: '4px',
                        }}
                      >
                        {meta.label}
                      </span>
                    )
                  })()}
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

              {runtimeMap[item.manifest.sha256]?.detail && (
                runtimeMap[item.manifest.sha256].state === 'failed' ||
                runtimeMap[item.manifest.sha256].state === 'deferred' ||
                runtimeMap[item.manifest.sha256].state === 'incompatible'
              ) && (
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#f59e0b' }}>
                  {runtimeMap[item.manifest.sha256].detail}
                </p>
              )}

              <div className="customization-actions" style={{ marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={
                    busy ||
                    Boolean(item.manifest.containsPaidRiotContent) ||
                    !(adapterStatus?.compatible)
                  }
                  onClick={() => void validateSingleMod(item.manifest.sha256)}
                >
                  Validate
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={
                    busy ||
                    Boolean(item.manifest.containsPaidRiotContent) ||
                    !(adapterStatus?.compatible && adapterStatus?.consentGranted && adapterStatus?.clearanceAcknowledged)
                  }
                  onClick={() => void applySingleMod(item.manifest.sha256)}
                >
                  Apply
                </button>
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
