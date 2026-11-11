import { useEffect, useState, type FormEvent } from 'react'
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [recoverySnapshot, setRecoverySnapshot] = useState<CreatorProject | null>(null)

  // New project modal
  const [showNewModal, setShowNewModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newChampion, setNewChampion] = useState('')
  const [newAuthor, setNewAuthor] = useState('')

  // File addition in project
  const [addPath, setAddPath] = useState('')

  // Quick Pack state
  const [quickFiles, setQuickFiles] = useState<File[]>([])
  const [quickOutput, setQuickOutput] = useState<{ archive: string; manifest: { modId: string; sha256: string } } | null>(null)

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
      setActiveProject(proj)
      // Check for local crash recovery snapshot
      try {
        const raw = localStorage.getItem(`laap_creator_snapshot_${id}`)
        if (raw) {
          const snap = JSON.parse(raw) as CreatorProject
          if (snap && snap.id === id && snap.updatedAt !== proj.updatedAt) {
            setRecoverySnapshot(snap)
          }
        }
      } catch {
        // ignore snapshot parse errors
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  // Debounced autosave effect
  useEffect(() => {
    if (!activeProject) return
    try {
      localStorage.setItem(`laap_creator_snapshot_${activeProject.id}`, JSON.stringify(activeProject))
    } catch {
      // ignore storage quota issues
    }
    setAutosaveStatus('saving')
    const timer = setTimeout(async () => {
      try {
        await creator.saveProject(activeProject)
        setAutosaveStatus('saved')
      } catch {
        setAutosaveStatus('idle')
      }
    }, 2000)
    return () => clearTimeout(timer)
  }, [activeProject])

  function restoreRecoverySnapshot() {
    if (recoverySnapshot) {
      setActiveProject(recoverySnapshot)
      setRecoverySnapshot(null)
      setStatus('Restored unsaved project state from crash recovery snapshot.')
    }
  }

  function discardRecoverySnapshot() {
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
      const saved = await creator.saveProject(activeProject)
      setActiveProject(saved)
      setStatus('Project saved and crash recovery snapshot updated.')
      await loadProjects()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
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
      await creator.deleteProject(id)
      if (activeProject?.id === id) setActiveProject(null)
      await loadProjects()
      setStatus('Project deleted.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleAddFile(file: File) {
    if (!activeProject) return
    setBusy(true)
    setError('')
    try {
      const b64 = await readFileBase64(file)
      const relPath = addPath.trim()
        ? `${addPath.trim().replace(/\\/g, '/')}/${file.name}`
        : `assets/characters/${activeProject.champion.toLowerCase()}/skins/skin${activeProject.skinNum}/${file.name}`
      const fileRecord = await creator.addFile(activeProject.id, relPath, b64)

      setActiveProject((prev) => {
        if (!prev) return prev
        const filtered = prev.files.filter((f) => f.relativePath !== fileRecord.relativePath)
        return { ...prev, files: [...filtered, fileRecord] }
      })
      setStatus(`Added "${file.name}" to package structure.`)
      setAddPath('')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveFile(relPath: string) {
    if (!activeProject) return
    setBusy(true)
    setError('')
    try {
      await creator.removeFile(activeProject.id, relPath)
      setActiveProject((prev) => {
        if (!prev) return prev
        return { ...prev, files: prev.files.filter((f) => f.relativePath !== relPath) }
      })
      setStatus(`Removed "${relPath}".`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function exportFantome() {
    if (!activeProject) return
    setBusy(true)
    setError('')
    try {
      const saved = await creator.saveProject(activeProject)
      setActiveProject(saved)
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
      const saved = await creator.saveProject(activeProject)
      setActiveProject(saved)
      const b64 = await creator.exportModpkg(saved.id)
      downloadBase64(b64, 'application/zip', `${activeProject.champion}_${activeProject.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.modpkg`)
      setStatus('Exported .modpkg archive successfully.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
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
      const res = await invokeTauri<{ archive: string; manifest: { modId: string; sha256: string } }>('creator_build_package', {
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
      if (res.repairedZipBase64) {
        setRepairB64(res.repairedZipBase64)
      }
      setStatus(`Repair finished: ${res.issuesFixed.length} issues corrected.`)
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

      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}

      {tab === 'projects' && (
        activeProject ? (
          /* Active Project Editor */
          <section className="customization-editor">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button className="btn-secondary" onClick={() => setActiveProject(null)}>← Back to projects</button>
                <span style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: '4px', background: autosaveStatus === 'saved' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)', color: autosaveStatus === 'saved' ? '#4ade80' : '#facc15' }}>
                  {autosaveStatus === 'saving' ? '● Autosaving...' : '✓ All changes autosaved'}
                </span>
              </div>
              <div className="customization-actions">
                <button className="btn-secondary" disabled={busy} onClick={() => void saveActiveProject()}>Save project</button>
                <button className="btn-primary" disabled={busy || activeProject.files.length === 0} onClick={() => void exportFantome()}>Export .fantome</button>
                <button className="btn-secondary" disabled={busy || activeProject.files.length === 0} onClick={() => void exportModpkg()}>Export .modpkg</button>
              </div>
            </div>

            {recoverySnapshot && (
              <div className="customization-card" style={{ marginBottom: '1rem', borderLeft: '4px solid #f59e0b', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>Crash Recovery Snapshot Available:</strong> An unsaved snapshot from a previous session was detected for this project.
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.85rem' }} onClick={restoreRecoverySnapshot}>Restore Snapshot</button>
                  <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.85rem' }} onClick={discardRecoverySnapshot}>Discard</button>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <h3>Project metadata</h3>
                <label>Skin / project name
                  <input value={activeProject.name} onChange={(e) => setActiveProject({ ...activeProject, name: e.target.value })} />
                </label>
                <label>Target champion
                  <input value={activeProject.champion} onChange={(e) => setActiveProject({ ...activeProject, champion: e.target.value })} />
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <label style={{ flex: 1 }}>Skin index
                    <input type="number" min={0} max={99} value={activeProject.skinNum} onChange={(e) => setActiveProject({ ...activeProject, skinNum: Number(e.target.value) })} />
                  </label>
                  <label style={{ flex: 1 }}>Version
                    <input value={activeProject.version} onChange={(e) => setActiveProject({ ...activeProject, version: e.target.value })} />
                  </label>
                </div>
                <label>Author
                  <input value={activeProject.author} onChange={(e) => setActiveProject({ ...activeProject, author: e.target.value })} />
                </label>
                <label>Description
                  <textarea rows={3} value={activeProject.description} onChange={(e) => setActiveProject({ ...activeProject, description: e.target.value })} />
                </label>
              </div>

              <div>
                <h3>Asset hierarchy & files ({activeProject.files.length})</h3>
                <div style={{ marginBottom: '1rem' }}>
                  <label>Override relative folder (optional, e.g. assets/characters/ahri/skins/skin01):
                    <input value={addPath} onChange={(e) => setAddPath(e.target.value)} placeholder="Auto-calculated from champion and skin index if left empty" />
                  </label>
                  <label className="btn-secondary" style={{ display: 'inline-block', marginTop: '0.5rem', cursor: 'pointer' }}>
                    + Add asset file (.skn, .skl, .dds, .bin, .anm)
                    <input type="file" style={{ display: 'none' }} onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void handleAddFile(f)
                    }} />
                  </label>
                </div>

                <div className="customization-card" style={{ maxHeight: '320px', overflowY: 'auto' }}>
                  {activeProject.files.length === 0 ? (
                    <p className="customization-empty">No files in package yet. Add 3D models (.skn), textures (.dds), or properties (.bin).</p>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {activeProject.files.map((file) => (
                        <li key={file.relativePath} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <div>
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
              <button className="btn-primary" onClick={() => setShowNewModal(true)}>+ New Project</button>
            </div>

            {showNewModal && (
              <div className="customization-card" style={{ gridColumn: '1 / -1', padding: '1.5rem', borderRadius: '8px' }}>
                <h4>Create new custom skin project</h4>
                <form onSubmit={(e) => void createProject(e)} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
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
                  <button className="btn-secondary" onClick={() => void deleteProject(p.id)}>Delete</button>
                </div>
              </div>
            ))}
          </section>
        )
      )}

      {tab === 'repair' && (
        <section className="customization-editor" style={{ padding: '1.5rem' }}>
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
                <div>Skeletons (.skl): <strong>{inspectionReport.hasSkeletons ? 'Present' : 'None'}</strong></div>
                <div>Property BIN (.bin): <strong>{inspectionReport.hasPropertyBin ? 'Present' : 'None'}</strong></div>
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
                    {repairResult.issuesFixed.map((fix, idx) => (
                      <li key={idx}>{fix}</li>
                    ))}
                  </ul>
                  {repairResult.repairedZipBase64 && (
                    <button className="btn-primary" style={{ marginTop: '0.5rem' }} onClick={() => downloadBase64(repairResult.repairedZipBase64!, 'application/zip', 'repaired_package.fantome')}>
                      Download Repaired .fantome
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {tab === 'bintool' && (
        <section className="customization-editor" style={{ padding: '1.5rem' }}>
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
        <section className="customization-editor" style={{ padding: '1.5rem' }}>
          <h3>League WAD Archive Inspector</h3>
          <p>Inspect League WAD archives (RWAC v3.x), examine entry tables, xxHash64 digests, and verify container integrity.</p>

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
        <section className="customization-editor">
          <h3>Quick image pack builder</h3>
          <p>Package loose PNG/WebP images into a signed, hash-verified LAAP mod package without creating a persistent project.</p>
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
              <p role="status">Package built successfully.</p>
              <div className="customization-actions">
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
