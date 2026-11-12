import { useEffect, useRef, useState, type FormEvent } from 'react'
import { invokeTauri } from '../../lib/api'
import { errorMessage, type PackageManifest } from './api'

export interface LibraryImportSource {
  archive: string
  displayName: string
  author: string
  version: string
  license?: string
  manifest?: PackageManifest
}

/** Rights are a user declaration, never inferred from the package format. */
export function LibraryImportDialog({ source, onClose, onImported }: {
  source: LibraryImportSource
  onClose: () => void
  onImported: (name: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [review, setReview] = useState<PackageManifest | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const inspected = await invokeTauri<PackageManifest>('mod_inspect', {
        archive: source.archive,
        declaration: {
          displayName: String(fields.get('name')).trim(),
          author: String(fields.get('author')).trim(),
          version: String(fields.get('version')).trim(),
          license: String(fields.get('license')).trim(),
          rightToDistribute: fields.has('redistribute'),
          containsPaidRiotContent: false,
        },
      })
      setReview(source.manifest ? { ...inspected,
        modId: source.manifest.modId, supportedGameBuilds: source.manifest.supportedGameBuilds,
        championIds: source.manifest.championIds, attributionUrl: source.manifest.attributionUrl,
        notes: source.manifest.notes,
      } : inspected)
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  async function importPackage() {
    if (!review || busy) return
    setBusy(true)
    setError('')
    try {
      await invokeTauri('mod_import', {
        archive: source.archive, manifest: review, rightsConfirmed: true,
      })
      window.dispatchEvent(new Event('laap:library-changed'))
      onImported(review.displayName)
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  return <dialog ref={dialog} aria-labelledby="library-import-title" className="customization-editor"
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <h3 id="library-import-title">Import into local Mod Library</h3>
    <p>This stores a local LAAP copy. Applying packages to League is unavailable.</p>
    {error && <p role="alert">{error}</p>}
    {review ? <>
      <dl>
        <dt>Package</dt><dd>{review.displayName} · {review.version}</dd>
        <dt>Credited author</dt><dd>{review.author}</dd>
        <dt>License or permission</dt><dd>{review.license}</dd>
        <dt>Permission to use</dt><dd>Confirmed for local use</dd>
        <dt>Permission to redistribute</dt><dd>{review.rightToDistribute ? 'Explicitly declared' : 'Not granted — local use only'}</dd>
        <dt>Validated contents</dt><dd>{review.files.length} files</dd>
      </dl>
      <button className="btn-secondary" disabled={busy} onClick={() => setReview(null)}>Edit declarations</button>
      <button className="btn-primary" disabled={busy} onClick={() => void importPackage()}>{busy ? 'Importing…' : 'Confirm local import'}</button>
    </> : <form onSubmit={event => void inspect(event)}>
      <fieldset disabled={busy}>
        <label>Package name <input name="name" required maxLength={160} defaultValue={source.displayName} /></label>
        <label>Original credited author <input name="author" required maxLength={120} defaultValue={source.author} /></label>
        <p>Keep the original credit. If unknown, state that explicitly; importing does not establish ownership.</p>
        <label>Version <input name="version" required maxLength={40} defaultValue={source.version} /></label>
        <label>License or permission <input name="license" required maxLength={80} defaultValue={source.license ?? ''} placeholder="Original license, or Private / local-only" /></label>
        <label><input name="use" type="checkbox" required /> I have permission to use these assets locally. They contain no paid Riot content, cheats or executables.</label>
        <label><input name="redistribute" type="checkbox" /> I separately confirm this license permits redistribution.</label>
        <button className="btn-primary">{busy ? 'Validating…' : 'Review permissions and contents'}</button>
      </fieldset>
    </form>}
    <button className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>
  </dialog>
}
