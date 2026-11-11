import { readFileBase64 } from './packageFiles'
import { useEffect, useState, type FormEvent } from 'react'
import { invokeTauri } from '../../lib/api'
import { errorMessage } from './api'

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
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [removing, setRemoving] = useState('')
  const [formKey, setFormKey] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')

  async function load() {
    try {
      setPackages(await invokeTauri<PackageRecord[]>('mod_list'))
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  useEffect(() => { void load() }, [])

  async function add(event: FormEvent) {
    event.preventDefault()
    if (!archive || !manifest || !confirmed) return
    setError('')
    setStatus('')
    if (archive.size > 12 * 1024 * 1024 || manifest.size > 256 * 1024) {
      setError('Choose an archive up to 12 MiB and a manifest up to 256 KiB.')
      return
    }
    setBusy(true)
    try {
      await invokeTauri('mod_import', {
        archive: await readFileBase64(archive),
        manifest: JSON.parse(await manifest.text()) as unknown,
        rightsConfirmed: confirmed,
      })
      setStatus('Package validated and saved.')
      setArchive(undefined)
      setManifest(undefined)
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

  const filteredPackages = packages?.filter(({ manifest: item }) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return item.displayName.toLowerCase().includes(q) ||
      item.author.toLowerCase().includes(q) ||
      item.license.toLowerCase().includes(q)
  })

  return (
    <>
      <h2>Mod library</h2>
      <p>Store and inspect rights-cleared image packages. Packages are never installed into the game.</p>
      <p className="customization-source">Format note: Only rights-declared image packages (.png, .jpeg, .webp) are accepted. Fantome/Modpkg archives containing compiled game WAD/BIN binaries require an authorized external game adapter and cannot be directly injected.</p>
      <form key={formKey} className="customization-editor" onSubmit={(event) => void add(event)}>
        <label>Asset archive <input type="file" required accept=".zip,.modpkg,.fantome" disabled={busy} onChange={(event) => setArchive(event.target.files?.[0])} /></label>
        <label>LAAP manifest JSON <input type="file" required accept=".json" disabled={busy} onChange={(event) => setManifest(event.target.files?.[0])} /></label>
        <label className="customization-check"><input type="checkbox" required checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} /> I have permission to use these assets and the archive contains no paid Riot content.</label>
        <button className="btn-primary" disabled={busy || !archive || !manifest || !confirmed}>{busy ? 'Working…' : 'Validate and import'}</button>
      </form>
      {error && <p role="alert">{error} {!packages && <button className="btn-secondary" onClick={() => { setError(''); void load() }}>Retry library</button>}</p>}
      {status && <p role="status">{status}</p>}
      {!packages && !error && <p role="status">Loading library…</p>}
      {packages && packages.length > 0 && (
        <div className="customization-filters">
          <label>Filter library <input type="search" placeholder="Search by name, author, or license…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></label>
        </div>
      )}
      {packages?.length === 0 && <p>Your library is empty.</p>}
      {packages && packages.length > 0 && filteredPackages?.length === 0 && <p>No packages match your search filter.</p>}
      <ul className="customization-list">
        {filteredPackages?.map(({ manifest: item, archiveBytes }) => (
          <li key={item.sha256}>
            <strong>{item.displayName} · {item.version}</strong>
            <span>{item.author} · {item.license} · {Math.ceil(archiveBytes / 1024)} KiB</span>
            <details>
              <summary>Inspect {item.files.length} files</summary>
              <p className="customization-source">Archive SHA-256 <code>{item.sha256}</code></p>
              <ul>{item.files.map((asset) => <li key={asset.relativePath}>{asset.relativePath} · {asset.sizeBytes} bytes</li>)}</ul>
            </details>
            <div className="customization-actions">
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
