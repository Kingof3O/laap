import { invokeTauri, hasTauri } from '../../lib/api'
import { useEffect, useState, type FormEvent } from 'react'
import { errorMessage, presets, type AccountOption, type Preset } from './api'
import { flavor } from '../../product/flavors'

export function PresetEditor({ draft, onSaved, onCancel }: {
  draft: Preset
  onSaved: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(draft.name)
  const [accountId, setAccountId] = useState(draft.accountId ?? '')
  const [queueMode, setQueueMode] = useState(draft.queueMode ?? '')
  const [notes, setNotes] = useState(draft.notes ?? '')
  const [favorite, setFavorite] = useState(draft.favorite ?? false)
  const [priority, setPriority] = useState(draft.priority ?? 0)
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (import.meta.env.MODE === 'studio' || flavor !== 'complete') return
    let current = true
    void invokeTauri<AccountOption[]>('list_local_accounts').then((rows) => {
      if (current) setAccounts(rows)
    }).catch((cause: unknown) => {
      if (current) setError(errorMessage(cause))
    })
    return () => { current = false }
  }, [])

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await presets.save({ ...draft, name, accountId: accountId || null, queueMode: queueMode || null, notes, favorite, priority })
      onSaved()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="customization-editor" onSubmit={(event) => void save(event)}>
      <label>Preset name <input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
      {flavor === 'complete' && (
        <label>Local profile
          <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <option value="">Any profile</option>
            {accountId && !accounts.some((account) => account.id === accountId) &&
              <option value={accountId} disabled>Unavailable profile</option>}
            {accounts.map((account) =>
              <option key={account.id} value={account.id}>{account.name} · {account.region}</option>)}
          </select>
        </label>
      )}
      <label>Queue preference <select value={queueMode} onChange={(event) => setQueueMode(event.target.value)}>
        <option value="">Any queue</option>
        {['classic', 'quickplay', 'swiftplay', 'aram', 'arena', 'tft'].map((mode) => <option key={mode}>{mode}</option>)}
      </select></label>
      <label>Notes <textarea maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      <label>Priority <input type="number" min={-100} max={100} value={priority} onChange={(event) => setPriority(Number(event.target.value))} /></label>
      <label className="customization-check"><input type="checkbox" checked={favorite} onChange={(event) => setFavorite(event.target.checked)} /> Favorite preset</label>
      {error && <p role="alert">{error}</p>}
      <div className="customization-actions">
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save preset'}</button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  )
}

export function PresetLibrary({ profile, onOpen }: { profile?: { id: string; name: string }; onOpen: (preset: Preset) => void }) {
  const [rows, setRows] = useState<Preset[] | null>(null)
  const [editing, setEditing] = useState<Preset | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [importing, setImporting] = useState<{ json: string; names: string[] } | null>(null)
  const [resolved, setResolved] = useState<Preset[] | null>(null)
  const [queue, setQueue] = useState('')

  async function exportLibrary() {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      if (hasTauri) {
        const saved = await invokeTauri<boolean>('customization_preset_export_file')
        if (saved) setStatus('Preset library exported.')
      } else {
        const data = await presets.export()
        const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
        const link = document.createElement('a')
        link.href = url
        link.download = 'laap-presets.json'
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 15_000)
      }
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function previewImport(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    setStatus('')
    try {
      if (file.size > 1024 * 1024) throw new Error('Preset files must be smaller than one MiB.')
      const json = await file.text()
      const summary = await presets.import(json, false)
      setImporting({ json, names: summary.names })
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function commitImport() {
    if (!importing) return
    setBusy(true)
    try {
      const summary = await presets.import(importing.json, true)
      setImporting(null)
      setStatus('Imported ' + summary.count + ' presets. Local profile links can be assigned in the editor.')
      load()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function duplicate(row: Preset) {
    setBusy(true)
    setError('')
    try {
      await presets.save({ ...row, id: null, revision: 0, name: row.name.slice(0, 70) + ' copy' })
      load()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function resolve() {
    setBusy(true)
    setError('')
    try {
      setResolved(await presets.resolve(profile?.id ?? null, queue || null))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const load = () => {
    setError('')
    void presets.list().then(setRows).catch((cause: unknown) => setError(errorMessage(cause)))
  }

  useEffect(() => { load() }, [])

  async function remove(id: string) {
    setBusy(true)
    try {
      await presets.remove(id)
      setDeleting(null)
      load()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const visible = rows?.filter((row) => !profile || !row.accountId || row.accountId === profile.id)

  return (
    <>
      <h2>{profile ? 'Presets for ' + profile.name : 'Saved presets'}</h2>
      <p>Keep cosmetic references here. Presets are stored on this device.</p>
      <div className="customization-actions">
        <button className="btn-secondary" disabled={busy} onClick={() => void exportLibrary()}>Export library</button>
        <label className="btn-secondary">Import presets <input type="file" accept=".json" disabled={busy} onChange={(event) => {
          void previewImport(event.target.files?.[0])
          event.target.value = ''
        }} /></label>
      </div>
      {status && <p role="status">{status}</p>}
      {importing && <section className="customization-editor">
        <h3>Import {importing.names.length} presets?</h3><p>Imports create separate copies. Profile links are assigned locally after import.</p>
        <ul>{importing.names.map((name, index) => <li key={index}>{name}</li>)}</ul>
        <div className="customization-actions">
          <button className="btn-primary" disabled={busy} onClick={() => void commitImport()}>Confirm import</button>
          <button className="btn-secondary" disabled={busy} onClick={() => setImporting(null)}>Cancel</button>
        </div>
      </section>}
      <div className="customization-filters">
        <label>Queue context <select value={queue} onChange={(event) => { setQueue(event.target.value); setResolved(null) }}>
          <option value="">Any queue</option>{['classic', 'quickplay', 'swiftplay', 'aram', 'arena', 'tft'].map((mode) => <option key={mode}>{mode}</option>)}
        </select></label>
        <button className="btn-secondary" disabled={busy} onClick={() => void resolve()}>Preview preset priority</button>
      </div>
      {resolved && <p role="status">{resolved.length ? 'Matching order: ' + resolved.map((preset) => preset.name).join(' → ') : 'No matching presets.'}</p>}
      {error && <p role="alert">{error} <button className="btn-secondary" onClick={load}>Retry</button></p>}
      {!rows && !error && <p role="status">Loading presets…</p>}
      {visible?.length === 0 && <p>Choose a skin in the catalog to create your first preset.</p>}
      <ul className="customization-list">
        {visible?.map((row) => row.id && (
          <li key={row.id}>
            <strong>{row.name}</strong>
            <span>{row.championId}{row.accountId ? ' · Linked to a local profile' : ''}</span>
            <div className="customization-actions">
              <button className="btn-secondary" onClick={() => onOpen(row)}>View selection</button>
              <button className="btn-secondary" disabled={busy} onClick={() => setEditing(row)}>Edit</button>
              <button className="btn-secondary" disabled={busy} onClick={() => void duplicate(row)}>Duplicate</button>
              {deleting === row.id ? <>
                <button className="btn-secondary" disabled={busy} onClick={() => void remove(row.id!)}>Confirm delete</button>
                <button className="btn-secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button>
              </> : <button className="btn-secondary" onClick={() => setDeleting(row.id)}>Delete</button>}
            </div>
            {editing?.id === row.id && editing && (
              <PresetEditor key={row.id} draft={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
