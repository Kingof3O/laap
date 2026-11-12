import { useEffect, useRef, useState, type FormEvent } from 'react'
import { invokeTauri, hasTauri } from '../../lib/api'
import {
  errorMessage,
  creator,
  fantome,
  binTool,
  wadTool,
  type CreatorProject,
  type ProjectSummary,
  type ProjectFile,
  type FantomeInspectionReport,
  type FantomeRepairResult,
  type BinInspectionReport,
  type WadInspectionReport,
} from './api'
import { readFileBase64 } from './packageFiles'
import { ProjectSaveQueue, readRecovery, writeRecovery, removeRecovery, removeSavedRecovery, validateSnapshot, projectFingerprint } from './projectPersistence'
import { LibraryImportDialog, type LibraryImportSource } from './LibraryImportDialog'

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

export function CreatorWorkshop() {
  const [tab, setTab] = useState<'projects' | 'quick' | 'repair' | 'bintool' | 'wadtool'>('projects')
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [activeProject, setActiveProject] = useState<CreatorProject | null>(null)
  const [libraryImport, setLibraryImport] = useState<LibraryImportSource | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [recoverySnapshot, setRecoverySnapshot] = useState<CreatorProject | null>(null)

  const saveQueue = useRef(new ProjectSaveQueue(creator.saveProject))
  const current = useRef(activeProject)
  current.current = activeProject
  const clean = useRef('')
  const revision = useRef(0)
  const autosaveTimer = useRef<number | undefined>(undefined)
  const nativeMutation = useRef(false)
  const savesInFlight = useRef(0)
  const undo = useRef<CreatorProject[]>([])
  const redo = useRef<CreatorProject[]>([])

  async function persist(project: CreatorProject) {
    window.clearTimeout(autosaveTimer.current)
    const fingerprint = projectFingerprint(project)
    savesInFlight.current++
    let saved: CreatorProject
    try { saved = await saveQueue.current.enqueue(project) }
    finally { savesInFlight.current-- }
    // Track what actually reached disk even if a newer edit is already visible.
    // Returning an edit to its earlier value must not hide an in-flight write.
    clean.current = fingerprint
    if (projectFingerprint(current.current) === fingerprint) {
      setAutosaveStatus('saved')
      setError(previous => previous.startsWith('Project save failed:') ? '' : previous)
      await removeSavedRecovery(project)
    }
    return saved
  }
  async function leaveProject() {
    if (busy || recoverySnapshot) return
    setBusy(true)
    try {
      if (activeProject && projectFingerprint(activeProject) !== clean.current) await persist(activeProject)
      setActiveProject(null)
      await loadProjects()
    } catch (cause) { setAutosaveStatus('error'); setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  function editProject(next: CreatorProject) {
    if (!activeProject) return
    // Metadata undo is bounded; asset payloads are shared until edited.
    undo.current = [...undo.current, activeProject].slice(-30)
    redo.current = []
    setActiveProject(next)
  }
  function undoEdit() {
    const previous = undo.current.pop()
    if (previous && activeProject) { redo.current.push(activeProject); setActiveProject(previous) }
  }
  function redoEdit() {
    const next = redo.current.pop()
    if (next && activeProject) { undo.current.push(activeProject); setActiveProject(next) }
  }

  // New project modal
  const [deletingProject, setDeletingProject] = useState<string | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newChampion, setNewChampion] = useState('')
  const [newAuthor, setNewAuthor] = useState('')

  // File addition in project
  const [addPath, setAddPath] = useState('')
  const [assetDragOver, setAssetDragOver] = useState(false)

  // Quick Pack state
  const [quickFiles, setQuickFiles] = useState<File[]>([])
  const [quickOutput, setQuickOutput] = useState<{ archive: string; manifest: import('./api').PackageManifest } | null>(null)

  // Repair Tool State
  const [repairB64, setRepairB64] = useState<string>('')
  const [inspectionReport, setInspectionReport] = useState<FantomeInspectionReport | null>(null)
  const [repairResult, setRepairResult] = useState<FantomeRepairResult | null>(null)

  // BIN Tool State
  const [binB64, setBinB64] = useState<string>('')
  const [binReport, setBinReport] = useState<BinInspectionReport | null>(null)
  const [binJson, setBinJson] = useState<string>('')

  // WAD Tool State
  const [wadB64, setWadB64] = useState<string>('')
  const [wadReport, setWadReport] = useState<WadInspectionReport | null>(null)

  async function loadProjects() {
    try {
      setProjects(await creator.listProjects())
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  useEffect(() => {
    void loadProjects()
  }, [])

  async function openProject(id: string) {
    setBusy(true)
    setError('')
    setRecoverySnapshot(null)
    try {
      const proj = await creator.getProject(id)
      let snapshot: CreatorProject | null = null
      try { snapshot = await readRecovery(id) }
      catch (cause) { setError(`Recovery rejected: ${errorMessage(cause)}. Opening the last native save.`) }
      // Migrate the old small browser snapshot once; native files remain authoritative.
      try {
        const raw = localStorage.getItem(`laap_creator_snapshot_${id}`)
        if (!snapshot && raw) snapshot = validateSnapshot(JSON.parse(raw), id)
      } catch (cause) { setError(`Legacy recovery could not be loaded: ${errorMessage(cause)}`) }
      clean.current = projectFingerprint(proj)
      undo.current = []; redo.current = []
      if (snapshot && projectFingerprint(snapshot) !== projectFingerprint(proj)) setRecoverySnapshot(snapshot)
      setAutosaveStatus('saved')
      setActiveProject(proj)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!activeProject || recoverySnapshot) return
    if (projectFingerprint(activeProject) === clean.current && savesInFlight.current === 0) {
      setAutosaveStatus('saved')
      return
    }
    const project = activeProject
    const sequence = ++revision.current
    setAutosaveStatus('saving')
    void writeRecovery(project, sequence).then(() => {
      try { localStorage.removeItem(`laap_creator_snapshot_${project.id}`) } catch { /* Native persistence is independent. */ }
    }).catch(cause => {
      setError(`Crash recovery unavailable: ${errorMessage(cause)}. Save the project before closing.`)
    })
    const timer = autosaveTimer.current = window.setTimeout(() => {
      void persist(project).catch(cause => {
        if (current.current?.id === project.id) {
          setAutosaveStatus('error')
          setError(`Project save failed: ${errorMessage(cause)}. Your draft remains open; retry Save project.`)
        }
      })
    }, 800)
    return () => window.clearTimeout(timer)
  }, [activeProject, recoverySnapshot])

  useEffect(() => () => {
    const project = current.current
    if (!nativeMutation.current && project && projectFingerprint(project) !== clean.current) void saveQueue.current.enqueue(project).catch(() => {
      // The versioned recovery snapshot remains available on reopening.
    })
  }, [])

  function restoreRecoverySnapshot() {
    if (recoverySnapshot) {
      setAutosaveStatus('saving')
      setActiveProject(recoverySnapshot)
      setRecoverySnapshot(null)
      setStatus('Restored unsaved project state from crash recovery snapshot.')
    }
  }

  async function discardRecoverySnapshot() {
    if (activeProject) await removeRecovery(activeProject.id).catch(cause => setError(errorMessage(cause)))
    if (activeProject) {
      try {
        localStorage.removeItem(`laap_creator_snapshot_${activeProject.id}`)
      } catch {
        // ignore
      }
    }
    setRecoverySnapshot(null)
  }

  async function createProject(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !newChampion.trim()) return
    setBusy(true)
    setError('')
    try {
      const proj = await creator.createProject(newName.trim(), newChampion.trim(), newAuthor.trim() || undefined)
      setShowNewModal(false)
      setNewName('')
      setNewChampion('')
      setNewAuthor('')
      await loadProjects()
      clean.current = projectFingerprint(proj)
      undo.current = []; redo.current = []
      setAutosaveStatus('saved')
      setActiveProject(proj)
      setStatus(`Project "${proj.name}" created.`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveActiveProject() {
    if (!activeProject) return
    setBusy(true)
    setError('')
    try {
      const saved = await persist(activeProject)
      setStatus('Project saved to this device.')
      await loadProjects()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function importProject(file: File) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (file.size > 8 * 1024 * 1024) throw Error('Project imports are limited to 8 MiB.')
      const project: CreatorProject = JSON.parse(await file.text())
      validateSnapshot(project, project.id)
      const imported = await creator.importProject(project)
      clean.current = projectFingerprint(imported)
      undo.current = []; redo.current = []
      setActiveProject(imported); setAutosaveStatus('saved')
      await loadProjects()
      setStatus('Imported project as a new local copy; original credits and assets are preserved.')
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function exportProject() {
    if (!activeProject || busy || recoverySnapshot) return
    setBusy(true); setError('')
    try {
      const saved = await persist(activeProject)
      if (hasTauri) {
        const written = await creator.exportFile(saved.id, 'project')
        setStatus(written ? 'Project backup saved, including original asset bytes.' : 'Project export cancelled.')
        return
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a'); link.href = url; link.download = `${saved.id}.laap-project.json`; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 10000)
      setStatus('Project backup download requested, including original asset bytes.')
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  async function duplicateProject(id: string) {
    setBusy(true)
    setError('')
    try {
      await creator.duplicateProject(id)
      await loadProjects()
      setStatus('Project duplicated.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function deleteProject(id: string) {
    setBusy(true)
    setError('')
    try {
      window.clearTimeout(autosaveTimer.current)
      await creator.deleteProject(id)
      await removeRecovery(id)
      setDeletingProject(null)
      if (activeProject?.id === id) setActiveProject(null)
      await loadProjects()
      setStatus('Project deleted.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleAddFiles(files: File[]) {
    if (!activeProject || busy || recoverySnapshot) return
    setBusy(true)
    nativeMutation.current = true
    setError('')
    try {
      await persist(activeProject)
      let added = 0
      for (const file of files) {
        const b64 = await readFileBase64(file)
        const folder = addPath.trim() || `assets/characters/${activeProject.champion.toLowerCase()}/skins/skin${activeProject.skinNum}`
        await creator.addFile(activeProject.id, `${folder.replace(/\\/g, '/')}/${file.name}`, b64)
        added++
      }
      setStatus(`Added ${added} asset(s).`)
      setAddPath('')
    } catch (cause) { setError(`Asset import stopped: ${errorMessage(cause)}. Previously imported files are retained.`) }
    finally {
      try {
        const saved = await creator.getProject(activeProject.id)
        clean.current = projectFingerprint(saved); undo.current = []; redo.current = []; setActiveProject(saved); setAutosaveStatus('saved')
      } catch (cause) { setError(errorMessage(cause)) }
      nativeMutation.current = false
      setBusy(false)
    }
  }

  async function handleRemoveFile(relPath: string) {
    if (!activeProject || busy || recoverySnapshot) return
    setBusy(true)
    nativeMutation.current = true
    setError('')
    try {
      await persist(activeProject)
      await creator.removeFile(activeProject.id, relPath)
      const saved = await creator.getProject(activeProject.id)
      clean.current = projectFingerprint(saved); undo.current = []; redo.current = []; setActiveProject(saved)
      setStatus(`Removed "${relPath}".`)
    } catch (cause) { setError(errorMessage(cause)) }
    finally { nativeMutation.current = false; setBusy(false) }
  }

  async function exportFantome() {
    if (!activeProject) return
    setBusy(true)
    setError('')
    try {
      const saved = await persist(activeProject)
      if (hasTauri) {
        const written = await creator.exportFile(saved.id, 'fantome')
        setStatus(written ? 'Saved .fantome package to the selected file.' : 'Package export cancelled.')
        return
      }
      const b64 = await creator.exportFantome(saved.id)
      downloadBase64(b64, 'application/zip', `${activeProject.champion}_${activeProject.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.fantome`)
      setStatus('Exported .fantome archive successfully.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function exportModpkg() {
    if (!activeProject) return
    setBusy(true)
    setError('')
    try {
      const saved = await persist(activeProject)
      if (hasTauri) {
        const written = await creator.exportFile(saved.id, 'modpkg')
        setStatus(written ? 'Saved .modpkg package to the selected file.' : 'Package export cancelled.')
        return
      }
      const b64 = await creator.exportModpkg(saved.id)
      downloadBase64(b64, 'application/zip', `${activeProject.champion}_${activeProject.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.modpkg`)
      setStatus('Exported .modpkg archive successfully.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function installProjectToLibrary() {
    if (!activeProject || activeProject.files.length === 0) return
    setBusy(true)
    setError('')
    try {
      const saved = await persist(activeProject)
      const b64 = await creator.exportFantome(saved.id)
      setLibraryImport({ archive: b64, displayName: saved.name, author: saved.author,
        version: saved.version })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function installQuickPackToLibrary() {
    if (!quickOutput) return
    setLibraryImport({ archive: quickOutput.archive, ...quickOutput.manifest, manifest: quickOutput.manifest })
  }

  async function installRepairedToLibrary() {
    if (!repairResult?.repairedArchiveBase64) return
    setBusy(true)
    setError('')
    try {
      const b64 = repairResult.repairedArchiveBase64
      const meta = await fantome.readMeta(b64)
      setLibraryImport({ archive: b64, displayName: meta.name, author: meta.author,
        version: meta.version, license: meta.license })
    } catch (e) { setError(errorMessage(e)) }
    finally { setBusy(false) }
  }

  // Quick Pack Builder
  async function buildQuickPack(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fields = new FormData(e.currentTarget)
    setError('')
    setQuickOutput(null)
    if (quickFiles.length < 1 || quickFiles.length > 24) {
      setError('Choose between 1 and 24 images.')
      return
    }
    setBusy(true)
    try {
      const res = await invokeTauri<{ archive: string; manifest: import('./api').PackageManifest }>('creator_build_package', {
        request: {
          modId: String(fields.get('id')).trim(),
          version: String(fields.get('version')).trim(),
          displayName: String(fields.get('name')).trim(),
          author: String(fields.get('author')).trim(),
          license: String(fields.get('license')).trim(),
          rightToDistribute: fields.has('distribute'),
          rightsConfirmed: fields.has('rights'),
          files: await Promise.all(quickFiles.map(async (f) => ({ name: f.name, data: await readFileBase64(f) }))),
        },
      })
      setQuickOutput(res)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // Fantome Inspection & Repair Handlers
  async function handleInspectFantome(file: File) {
    setBusy(true)
    setError('')
    setRepairResult(null)
    try {
      const b64 = await readFileBase64(file)
      setRepairB64(b64)
      const report = await fantome.inspect(b64)
      setInspectionReport(report)
      setStatus(`Inspected "${file.name}": ${report.fileCount} files, valid: ${report.isValid}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleExecuteRepair() {
    if (!repairB64) return
    setBusy(true)
    setError('')
    try {
      const res = await fantome.repair(repairB64)
      setRepairResult(res)
      if (res.repairedArchiveBase64) {
        setRepairB64(res.repairedArchiveBase64)
      }
      setStatus(`Repair finished: ${res.actionsTaken.length} issues corrected.`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // BIN Tool Handlers
  async function handleInspectBin(file: File) {
    setBusy(true)
    setError('')
    try {
      const b64 = await readFileBase64(file)
      setBinB64(b64)
      const report = await binTool.inspect(b64)
      setBinReport(report)
      const json = await binTool.convertToJson(b64)
      setBinJson(json)
      setStatus(`Parsed "${file.name}": version ${report.version}, ${report.entriesCount} entries.`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleCompileBin() {
    if (!binJson.trim()) return
    setBusy(true)
    setError('')
    try {
      const b64 = await binTool.convertFromJson(binJson)
      downloadBase64(b64, 'application/octet-stream', 'compiled.bin')
      setStatus('Successfully compiled JSON back to binary PROP file.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // WAD Tool Handlers
  async function handleInspectWad(file: File) {
    setBusy(true)
    setError('')
    try {
      const b64 = await readFileBase64(file)
      setWadB64(b64)
      const report = await wadTool.inspect(b64)
      setWadReport(report)
      setStatus(`WAD archive "${file.name}": v${report.major}.${report.minor}, ${report.entryCount} entries.`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="customization-heading">
        <div>
          <h2>Creator workshop</h2>
          <p>Author, inspect, repair, and convert custom mod assets (.fantome, .modpkg, .bin, and .wad).</p>
        </div>
        <div className="customization-actions">
          <button className={tab === 'projects' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('projects')}>Project Studio</button>
          <button className={tab === 'repair' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('repair')}>Fantome Repair</button>
          <button className={tab === 'bintool' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('bintool')}>BIN Converter</button>
          <button className={tab === 'wadtool' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('wadtool')}>WAD Inspector</button>
          <button className={tab === 'quick' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('quick')}>Quick Image Pack</button>
        </div>
      </div>

      {libraryImport && <LibraryImportDialog source={libraryImport}
        onClose={() => setLibraryImport(null)}
        onImported={name => { setLibraryImport(null); setStatus(`Imported "${name}" into the local Mod Library. Game-side application is unavailable.`) }} />}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}

      {tab === 'projects' && (
        activeProject ? (
          /* Active Project Editor */
          <section className="customization-editor creator-workbench">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button className="btn-secondary" disabled={busy || !!recoverySnapshot} onClick={() => void leaveProject()}>← Back to projects</button>
                <span style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: '4px', background: autosaveStatus === 'saved' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)', color: autosaveStatus === 'saved' ? '#4ade80' : '#facc15' }}>
                  {autosaveStatus === 'saving' ? 'Saving…' : autosaveStatus === 'saved' ? 'Saved to this device' : autosaveStatus === 'error' ? 'Save failed — retry required' : 'Unsaved changes'}
                </span>
              </div>
              <div className="customization-actions">
                <button className="btn-secondary" disabled={busy || !undo.current.length} onClick={undoEdit}>Undo metadata edit</button>
                <button className="btn-secondary" disabled={busy || !redo.current.length} onClick={redoEdit}>Redo metadata edit</button>
                <button className="btn-secondary" disabled={busy || !!recoverySnapshot} onClick={() => void saveActiveProject()}>Save project</button>
                <button className="btn-primary" disabled={busy || !!recoverySnapshot || activeProject.files.length === 0} onClick={() => void installProjectToLibrary()}>Import into local Mod Library</button>
                <button className="btn-secondary" disabled={busy || !!recoverySnapshot} onClick={() => void exportProject()}>Export project backup</button>
                <button className="btn-primary" disabled={busy || !!recoverySnapshot || activeProject.files.length === 0} onClick={() => void exportFantome()}>Export .fantome</button>
                <button className="btn-secondary" disabled={busy || !!recoverySnapshot || activeProject.files.length === 0} onClick={() => void exportModpkg()}>Export .modpkg</button>
              </div>
            </div>

            {recoverySnapshot && (
              <div className="customization-card" style={{ marginBottom: '1rem', borderLeft: '4px solid #f59e0b', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>Crash Recovery Snapshot Available:</strong> An unsaved snapshot from a previous session was detected for this project.
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.85rem' }} onClick={restoreRecoverySnapshot}>Restore Snapshot</button>
                  <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.85rem' }} onClick={() => void discardRecoverySnapshot()}>Discard</button>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))', gap: '1rem' }}>
              <div>
                <fieldset disabled={busy || !!recoverySnapshot}><h3>Project metadata</h3>
                <label>Skin / project name
                  <input value={activeProject.name} onChange={(e) => editProject({ ...activeProject, name: e.target.value })} />
                </label>
                <label>Target champion
                  <input value={activeProject.champion} onChange={(e) => editProject({ ...activeProject, champion: e.target.value })} />
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <label style={{ flex: 1 }}>Skin index
                    <input type="number" min={0} max={99} value={activeProject.skinNum} onChange={(e) => editProject({ ...activeProject, skinNum: Number(e.target.value) })} />
                  </label>
                  <label style={{ flex: 1 }}>Version
                    <input maxLength={40} value={activeProject.version} onChange={(e) => editProject({ ...activeProject, version: e.target.value })} />
                  </label>
                </div>
                <label>Author
                  <input value={activeProject.author} onChange={(e) => editProject({ ...activeProject, author: e.target.value })} />
                </label>
                <label>Description
                  <textarea rows={3} value={activeProject.description} onChange={(e) => editProject({ ...activeProject, description: e.target.value })} />
                </label></fieldset>
              </div>

              <div>
                <h3>Asset hierarchy & files ({activeProject.files.length})</h3>
                <div style={{ marginBottom: '1rem' }}>
                  <label>Override relative folder (optional, e.g. assets/characters/ahri/skins/skin01):
                    <input value={addPath} onChange={(e) => setAddPath(e.target.value)} placeholder="Auto-calculated from champion and skin index if left empty" />
                  </label>
                  <label className="btn-secondary" style={{ display: 'inline-block', marginTop: '0.5rem', cursor: 'pointer' }}>
                    + Add asset file (.skn, .skl, .dds, .bin, .anm)
                    <input type="file" disabled={busy || !!recoverySnapshot} multiple style={{ display: 'none' }} onChange={(e) => {
                      const files = Array.from(e.target.files || [])
                      void handleAddFiles(files)
                    }} />
                  </label>
                </div>

                <div
                  className="customization-card"
                  onDragOver={(e) => { e.preventDefault(); setAssetDragOver(true) }}
                  onDragLeave={() => setAssetDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setAssetDragOver(false)
                    const files = Array.from(e.dataTransfer.files || [])
                    void handleAddFiles(files)
                  }}
                  style={{
                    maxHeight: '320px',
                    overflowY: 'auto',
                    border: assetDragOver ? '2px dashed var(--accent, #6366f1)' : undefined,
                    background: assetDragOver ? 'rgba(99, 102, 241, 0.08)' : undefined,
                  }}
                >
                  {activeProject.files.length === 0 ? (
                    <p className="customization-empty">No files in package yet. Drag & drop or add 3D models (.skn), textures (.dds), or properties (.bin).</p>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {activeProject.files.map((file) => (
                        <li key={file.relativePath} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <div>
                            {file.dataBase64 && /\.(png|jpe?g|webp)$/i.test(file.relativePath) && <img loading="lazy" alt={`Asset preview: ${file.relativePath}`} src={`data:image/${/\.png$/i.test(file.relativePath) ? 'png' : /\.webp$/i.test(file.relativePath) ? 'webp' : 'jpeg'};base64,${file.dataBase64}`} style={{ width: 64, height: 64, objectFit: 'contain' }} />}
                            <span style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{file.relativePath}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #888)', marginLeft: '8px' }}>
                              ({(file.sizeBytes / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                          <button className="btn-secondary" style={{ padding: '2px 8px', fontSize: '0.8rem' }} onClick={() => void handleRemoveFile(file.relativePath)}>Remove</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : (
          /* Project List */
          <section className="customization-grid">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gridColumn: '1 / -1' }}>
              <h3>Local Projects ({projects?.length ?? 0})</h3>
              <div className="customization-actions"><label>Import project backup<input type="file" accept=".json" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void importProject(file); e.target.value = '' }} /></label>
              <button className="btn-primary" disabled={busy} onClick={() => setShowNewModal(true)}>+ New Project</button></div>
            </div>

            {showNewModal && (
              <div className="customization-card" style={{ gridColumn: '1 / -1', padding: '1.5rem', borderRadius: '8px' }}>
                <h4>Create new custom skin project</h4>
                <form onSubmit={(e) => void createProject(e)} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))', gap: '1rem', marginTop: '1rem' }}>
                  <label>Project name
                    <input required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Spirit Blossom Chroma" />
                  </label>
                  <label>Target champion
                    <input required value={newChampion} onChange={(e) => setNewChampion(e.target.value)} placeholder="e.g. Ahri" />
                  </label>
                  <label>Author (optional)
                    <input value={newAuthor} onChange={(e) => setNewAuthor(e.target.value)} placeholder="Your name or handle" />
                  </label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                    <button type="submit" className="btn-primary" disabled={busy}>Create project</button>
                    <button type="button" className="btn-secondary" onClick={() => setShowNewModal(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            {projects && projects.length === 0 && !showNewModal && (
              <div className="customization-card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem' }}>
                <p>No projects created yet. Start a new skin project to author packages.</p>
              </div>
            )}

            {projects?.map((p) => (
              <div key={p.id} className="customization-card" style={{ padding: '1rem', borderRadius: '8px' }}>
                <h4>{p.name}</h4>
                <p className="customization-source">Champion: <strong>{p.champion}</strong></p>
                <p style={{ fontSize: '0.85rem' }}>{p.fileCount} files · Version {p.version}</p>
                <div className="customization-actions" style={{ marginTop: '1rem' }}>
                  <button className="btn-primary" onClick={() => void openProject(p.id)}>Open</button>
                  <button className="btn-secondary" onClick={() => void duplicateProject(p.id)}>Duplicate</button>
                  {deletingProject === p.id ? <>
                    <span>Remove this project and its local assets?</span>
                    <button className="btn-secondary" disabled={busy} onClick={() => void deleteProject(p.id)}>Confirm project deletion</button>
                    <button className="btn-secondary" onClick={() => setDeletingProject(null)}>Cancel deletion</button>
                  </> : <button className="btn-secondary" disabled={busy} onClick={() => setDeletingProject(p.id)}>Delete…</button>}
                </div>
              </div>
            ))}
          </section>
        )
      )}

      {tab === 'repair' && (
        <section className="customization-editor creator-workbench" style={{ padding: '1.5rem' }}>
          <h3>Fantome Package Inspector & Structural Repair</h3>
          <p>Inspect community .fantome packages, detect missing metadata, casing discrepancies, or missing skeletons, and reconstruct standard packages.</p>

          <label className="btn-secondary" style={{ display: 'inline-block', margin: '1rem 0', cursor: 'pointer' }}>
            Choose .fantome / .zip archive to inspect
            <input type="file" accept=".fantome,.zip,.modpkg" style={{ display: 'none' }} onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleInspectFantome(f)
            }} />
          </label>

          {inspectionReport && (
            <div className="customization-card" style={{ padding: '1rem', marginTop: '1rem' }}>
              <h4>Inspection Results</h4>
              <p>Status: <strong style={{ color: inspectionReport.isValid ? '#10b981' : '#f59e0b' }}>{inspectionReport.isValid ? 'Valid Package' : 'Issues Found'}</strong></p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', margin: '1rem 0' }}>
                <div>Total files: <strong>{inspectionReport.fileCount}</strong></div>
                <div>META/info.json: <strong>{inspectionReport.metaFound ? 'Found' : 'Missing'}</strong></div>
                <div>3D Mesh (.skn): <strong>{inspectionReport.hasMesh ? 'Present' : 'None'}</strong></div>
                <div>Textures (.dds): <strong>{inspectionReport.hasTextures ? 'Present' : 'None'}</strong></div>
                <div>Skeletons (.skl): <strong>{inspectionReport.hasSkeleton ? 'Present' : 'None'}</strong></div>
              </div>

              {inspectionReport.issuesFound.length > 0 && (
                <div style={{ margin: '1rem 0', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px' }}>
                  <strong>Issues Detected:</strong>
                  <ul>
                    {inspectionReport.issuesFound.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                  <button className="btn-primary" disabled={busy} onClick={() => void handleExecuteRepair()}>
                    {busy ? 'Repairing…' : 'Repair & Normalize Package'}
                  </button>
                </div>
              )}

              {repairResult && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '6px' }}>
                  <strong>Repair Summary:</strong>
                  <ul>
                    {repairResult.actionsTaken.map((fix, idx) => (
                      <li key={idx}>{fix}</li>
                    ))}
                  </ul>
                  {repairResult.repairedArchiveBase64 && (
                    <div className="customization-actions" style={{ marginTop: '0.5rem' }}>
                      <button className="btn-primary" disabled={busy} onClick={() => void installRepairedToLibrary()}>
                        Import into local Mod Library
                      </button>
                      <button className="btn-secondary" onClick={() => downloadBase64(repairResult.repairedArchiveBase64!, 'application/zip', 'repaired_package.fantome')}>
                        Download Repaired .fantome
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {tab === 'bintool' && (
        <section className="customization-editor creator-workbench" style={{ padding: '1.5rem' }}>
          <h3>League PROP Binary (.bin) Converter</h3>
          <p>Inspect, decompile to JSON, and recompile League of Legends binary property files.</p>

          <label className="btn-secondary" style={{ display: 'inline-block', margin: '1rem 0', cursor: 'pointer' }}>
            Choose .bin property file to inspect
            <input type="file" accept=".bin" style={{ display: 'none' }} onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleInspectBin(f)
            }} />
          </label>

          {binReport && (
            <div className="customization-card" style={{ padding: '1rem', marginTop: '1rem' }}>
              <h4>Property File Header: Version {binReport.version}</h4>
              <p>Entries: <strong>{binReport.entriesCount}</strong> · Total Fields: <strong>{binReport.totalFieldsCount}</strong> · Linked files: <strong>{binReport.linkedFilesCount}</strong></p>

              <div style={{ marginTop: '1rem' }}>
                <label>Structured Property Tree (JSON):
                  <textarea rows={14} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }} value={binJson} onChange={(e) => setBinJson(e.target.value)} />
                </label>
                <button className="btn-primary" style={{ marginTop: '0.5rem' }} disabled={busy} onClick={() => void handleCompileBin()}>
                  {busy ? 'Compiling…' : 'Recompile to Binary PROP (.bin)'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'wadtool' && (
        <section className="customization-editor creator-workbench" style={{ padding: '1.5rem' }}>
          <h3>League WAD Archive Inspector</h3>
          <p>Inspect supported RW WAD archives and entry metadata. Inspection does not verify Riot signatures or apply assets to League.</p>

          <label className="btn-secondary" style={{ display: 'inline-block', margin: '1rem 0', cursor: 'pointer' }}>
            Choose .wad / .wad.client file to inspect
            <input type="file" accept=".wad,.client" style={{ display: 'none' }} onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleInspectWad(f)
            }} />
          </label>

          {wadReport && (
            <div className="customization-card" style={{ padding: '1rem', marginTop: '1rem' }}>
              <h4>WAD v{wadReport.major}.{wadReport.minor} Archive</h4>
              <button className="btn-secondary" disabled={busy} onClick={() => {
                setBusy(true); setError('')
                void wadTool.extractLocal(wadB64).then(result => setStatus(`Extracted ${result.extractedCount} files into LAAP's local export folder: ${result.outputDir}. No League files were changed.`))
                  .catch(cause => setError(`Extraction stopped: ${errorMessage(cause)}. Any completed files remain in the separate LAAP export folder.`))
                  .finally(() => setBusy(false))
              }}>{busy ? 'Extracting…' : 'Extract into a new LAAP export folder'}</button>
              <p>Entries: <strong>{wadReport.entryCount}</strong> · Total Uncompressed: <strong>{(wadReport.totalUncompressedSize / (1024 * 1024)).toFixed(2)} MB</strong> · Compressed: <strong>{(wadReport.totalCompressedSize / (1024 * 1024)).toFixed(2)} MB</strong></p>

              <div style={{ maxHeight: '300px', overflowY: 'auto', marginTop: '1rem' }}>
                <table style={{ width: '100%', fontSize: '0.85rem', textAlign: 'left', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '6px' }}>Path Hash</th>
                      <th style={{ padding: '6px' }}>Offset</th>
                      <th style={{ padding: '6px' }}>Compressed</th>
                      <th style={{ padding: '6px' }}>Uncompressed</th>
                      <th style={{ padding: '6px' }}>Compression</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wadReport.entries.slice(0, 50).map((e) => (
                      <tr key={e.pathHashHex} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '4px 6px', fontFamily: 'monospace' }}>{e.pathHashHex}</td>
                        <td style={{ padding: '4px 6px' }}>{e.offset}</td>
                        <td style={{ padding: '4px 6px' }}>{e.compressedSize} B</td>
                        <td style={{ padding: '4px 6px' }}>{e.uncompressedSize} B</td>
                        <td style={{ padding: '4px 6px' }}>{e.compressionName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {wadReport.entries.length > 50 && (
                  <p style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.5rem' }}>Showing first 50 entries of {wadReport.entryCount}.</p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'quick' && (
        <section className="customization-editor creator-workbench">
          <h3>Quick image pack builder</h3>
          <p>Package loose PNG/WebP images into a hash-verified LAAP mod package without creating a persistent project.</p>
          <form onSubmit={(event) => void buildQuickPack(event)}>
            <fieldset disabled={busy}>
              <label>Package ID <input required name="id" maxLength={100} pattern="[a-zA-Z0-9._\-]+" placeholder="creator.project" /></label>
              <label>Display name <input required name="name" maxLength={160} /></label>
              <label>Version <input required name="version" maxLength={40} defaultValue="1.0.0" /></label>
              <label>Author <input required name="author" maxLength={120} /></label>
              <label>License <input required name="license" maxLength={80} placeholder="CC0-1.0, for example" /></label>
              <label>Original images <input required multiple type="file" accept=".png,.jpg,.jpeg,.webp" onChange={(event) => setQuickFiles(Array.from(event.target.files ?? []))} /></label>
              <label className="customization-check"><input name="rights" type="checkbox" required /> I have rights to package these images. They contain no paid Riot content.</label>
              <label className="customization-check"><input name="distribute" type="checkbox" /> The license permits redistribution.</label>
              <button className="btn-primary" disabled={busy}>{busy ? 'Validating…' : 'Build package'}</button>
            </fieldset>
          </form>
          {quickOutput && (
            <div style={{ marginTop: '1rem' }}>
              <p role="status" style={{ color: '#10b981' }}>Package built successfully.</p>
              <div className="customization-actions">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => void installQuickPackToLibrary()}
                >
                  Import into local Mod Library
                </button>
                <button className="btn-secondary" onClick={() => downloadBase64(quickOutput.archive, 'application/zip', `${quickOutput.manifest.modId}.zip`)}>Download ZIP</button>
                <button className="btn-secondary" onClick={() => downloadBase64(btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(quickOutput.manifest, null, 2)))), 'application/json', `${quickOutput.manifest.modId}.json`)}>Download Manifest</button>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  )
}
