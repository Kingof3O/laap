import { useState, type FormEvent } from 'react'
import { invokeTauri, hasTauri } from '../../lib/api'
import { errorMessage } from './api'
import { readFileBase64 } from './packageFiles'

interface CreatorExport { archive: string; manifest: { modId: string; sha256: string } }

function download(bytes: BlobPart, type: string, name: string) {
  const href = URL.createObjectURL(new Blob([bytes], { type }))
  const link = document.createElement('a')
  link.href = href
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 15_000)
}

export function CreatorWorkshop() {
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [output, setOutput] = useState<CreatorExport | null>(null)
  const [error, setError] = useState('')

  async function build(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setError('')
    setOutput(null)
    if (files.length < 1 || files.length > 24 || files.reduce((total, file) => total + file.size, 0) > 11 * 1024 * 1024) {
      setError('Choose between 1 and 24 images with a combined size below 11 MiB.')
      return
    }
    setBusy(true)
    try {
      setOutput(await invokeTauri<CreatorExport>('creator_build_package', { request: {
        modId: String(fields.get('id')).trim(), version: String(fields.get('version')).trim(),
        displayName: String(fields.get('name')).trim(), author: String(fields.get('author')).trim(),
        license: String(fields.get('license')).trim(), rightToDistribute: fields.has('distribute'),
        rightsConfirmed: fields.has('rights'),
        files: await Promise.all(files.map(async (file) => ({ name: file.name, data: await readFileBase64(file) }))),
      } }))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function save(kind: 'zip' | 'manifest') {
    if (!output) return
    setBusy(true)
    setError('')
    try {
      if (hasTauri) {
        await invokeTauri<boolean>('creator_save_package', { ...output, kind })
      } else if (kind === 'zip') {
        download(Uint8Array.from(atob(output.archive), (byte) => byte.charCodeAt(0)), 'application/zip', output.manifest.modId + '.zip')
      } else {
        download(JSON.stringify(output.manifest, null, 2), 'application/json', output.manifest.modId + '.json')
      }
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h2>Creator workshop</h2>
      <p>Build a checksummed archive and license manifest from your original images. Both files can be imported into the mod library.</p>
      <form className="customization-editor" onSubmit={(event) => void build(event)}>
        <fieldset disabled={busy}>
          <label>Package ID <input required name="id" maxLength={100} pattern="[a-zA-Z0-9._\-]+" placeholder="creator.project" /></label>
          <label>Display name <input required name="name" maxLength={160} /></label>
          <label>Version <input required name="version" maxLength={40} defaultValue="1.0.0" /></label>
          <label>Author <input required name="author" maxLength={120} /></label>
          <label>License <input required name="license" maxLength={80} placeholder="CC0-1.0, for example" /></label>
          <label>Original images <input required multiple type="file" accept=".png,.jpg,.jpeg,.webp" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label>
          <label className="customization-check"><input name="rights" type="checkbox" required /> I have rights to package these images. They contain no paid Riot content.</label>
          <label className="customization-check"><input name="distribute" type="checkbox" /> The license permits redistribution.</label>
          <button className="btn-primary" disabled={busy}>{busy ? 'Validating…' : 'Build package'}</button>
        </fieldset>
      </form>
      {error && <p role="alert">{error}</p>}
      {output && <section>
        <p role="status">Package built and validated.</p>
        <p className="customization-source">SHA-256 <code>{output.manifest.sha256}</code></p>
        <div className="customization-actions">
          <button className="btn-secondary" disabled={busy} onClick={() => void save('zip')}>Save ZIP</button>
          <button className="btn-secondary" disabled={busy} onClick={() => void save('manifest')}>Save manifest</button>
        </div>
      </section>}
    </>
  )
}
