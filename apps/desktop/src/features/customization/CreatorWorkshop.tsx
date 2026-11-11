import { useEffect, useState, type FormEvent } from 'react'
import { invokeTauri, hasTauri } from '../../lib/api'
import { errorMessage, creator, type CreatorProject, type ProjectSummary, type ProjectFile } from './api'
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
  const [tab, setTab] = useState<'projects' | 'quick'>('projects')
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [activeProject, setActiveProject] = useState<CreatorProject | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

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
    try {
      const proj = await creator.getProject(id)
      setActiveProject(proj)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
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
      const relPath = addPath.trim() ? `${addPath.trim().replace(/\\/g, '/')}/${file.name}` : `assets/characters/${activeProject.champion.toLowerCase()}/skins/skin${activeProject.skinNum}/${file.name}`
      const fileRecord = await creator.addFile(activeProject.id, relPath, b64)

      // Update in local state
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

  return (
    <>
      <div className="customization-heading">
        <div>
          <h2>Creator workshop</h2>
          <p>Author, inspect, package, and export custom skin packages (.fantome and .modpkg).</p>
        </div>
        <div className="customization-actions">
          <button className={tab === 'projects' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('projects')}>Project Studio</button>
          <button className={tab === 'quick' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('quick')}>Quick Image Pack</button>
        </div>
      </div>

      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}

      {tab === 'projects' ? (
        activeProject ? (
          /* Active Project Editor */
          <section className="customization-editor">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <button className="btn-secondary" onClick={() => setActiveProject(null)}>← Back to projects</button>
              <div className="customization-actions">
                <button className="btn-secondary" disabled={busy} onClick={() => void saveActiveProject()}>Save project</button>
                <button className="btn-primary" disabled={busy || activeProject.files.length === 0} onClick={() => void exportFantome()}>Export .fantome</button>
                <button className="btn-secondary" disabled={busy || activeProject.files.length === 0} onClick={() => void exportModpkg()}>Export .modpkg</button>
              </div>
            </div>

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
                <label>Author / credit
                  <input value={activeProject.author} onChange={(e) => setActiveProject({ ...activeProject, author: e.target.value })} />
                </label>
                <label>Description & notes
                  <textarea rows={3} value={activeProject.description} onChange={(e) => setActiveProject({ ...activeProject, description: e.target.value })} />
                </label>
              </div>

              <div>
                <h3>Package assets ({activeProject.files.length})</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>Add character textures (.dds, .png), skeletons (.skl), meshes (.skn), and audio (.ogg).</p>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label>Relative subfolder path (optional)
                    <input placeholder="e.g. assets/characters/ahri/skins/base" value={addPath} onChange={(e) => setAddPath(e.target.value)} />
                  </label>
                  <label className="btn-secondary" style={{ display: 'inline-block', marginTop: '4px' }}>
                    + Add asset file
                    <input type="file" accept=".dds,.skn,.skl,.anm,.bin,.wad,.png,.jpg,.jpeg,.webp,.ogg,.wav" style={{ display: 'none' }} disabled={busy} onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void handleAddFile(f)
                      e.target.value = ''
                    }} />
                  </label>
                </div>

                {activeProject.files.length === 0 ? (
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No asset files added yet. Add textures or models to build the package.</p>
                ) : (
                  <ul style={{ maxHeight: '240px', overflowY: 'auto', fontSize: '0.85rem', paddingLeft: 0, listStyle: 'none' }}>
                    {activeProject.files.map((f) => (
                      <li key={f.relativePath} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div>
                          <strong>{f.relativePath}</strong>
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{f.formatType} · {Math.ceil(f.sizeBytes / 1024)} KiB</span>
                        </div>
                        <button type="button" className="btn-secondary" style={{ padding: '2px 8px', fontSize: '0.75rem' }} disabled={busy} onClick={() => void handleRemoveFile(f.relativePath)}>Remove</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        ) : (
          /* Projects List */
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>Local Creator Projects</h3>
              <button className="btn-primary" onClick={() => setShowNewModal(true)}>+ New Project</button>
            </div>

            {showNewModal && (
              <form className="customization-editor" style={{ marginBottom: '1.5rem' }} onSubmit={(e) => void createProject(e)}>
                <h4>Create new project</h4>
                <label>Skin name <input required placeholder="e.g. Star Guardian Kayn" value={newName} onChange={(e) => setNewName(e.target.value)} /></label>
                <label>Champion <input required placeholder="e.g. Kayn" value={newChampion} onChange={(e) => setNewChampion(e.target.value)} /></label>
                <label>Author <input placeholder="e.g. HextechArtisan" value={newAuthor} onChange={(e) => setNewAuthor(e.target.value)} /></label>
                <div className="customization-actions">
                  <button type="submit" className="btn-primary" disabled={busy}>Create project</button>
                  <button type="button" className="btn-secondary" onClick={() => setShowNewModal(false)}>Cancel</button>
                </div>
              </form>
            )}

            {!projects ? <p role="status">Loading projects…</p> : projects.length === 0 ? (
              <p>No creator projects found. Click "+ New Project" to start authoring custom skins.</p>
            ) : (
              <div className="customization-grid">
                {projects.map((p) => (
                  <div key={p.id} className="customization-card" style={{ padding: '1rem' }}>
                    <strong>{p.name}</strong>
                    <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', margin: '4px 0' }}>{p.champion} · {p.fileCount} asset files</span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Author: {p.author} · v{p.version}</span>
                    <div className="customization-actions" style={{ marginTop: '0.75rem' }}>
                      <button className="btn-primary" onClick={() => void openProject(p.id)}>Open</button>
                      <button className="btn-secondary" onClick={() => void duplicateProject(p.id)}>Duplicate</button>
                      <button className="btn-secondary" onClick={() => void deleteProject(p.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      ) : (
        /* Quick Image Pack Builder */
        <section>
          <p>Package rights-cleared PNG/JPEG/WebP images into a checksummed archive with metadata manifest.</p>
          <form className="customization-editor" onSubmit={(event) => void buildQuickPack(event)}>
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
