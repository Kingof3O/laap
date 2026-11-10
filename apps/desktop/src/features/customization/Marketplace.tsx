import { useEffect, useRef, useState } from 'react'
import { invokeTauri } from '../../lib/api'
import { errorMessage } from './api'
import { catalogOrigin } from './communityEndpoint'
import { readFileBase64 } from './packageFiles'

type Listing = { hash: string; bytes: number; displayName: string; author: string; license: string; version: string }

async function fetchBytes(path: string, limit: number, signal: AbortSignal, type: string) {
  const response = await fetch(catalogOrigin + path, {
    signal, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
  })
  if (!response.ok) throw new Error('Community catalog returned HTTP ' + response.status + '.')
  if (!response.body || !response.headers.get('content-type')?.startsWith(type) ||
    Number(response.headers.get('content-length')) > limit) throw new Error('Invalid community response.')
  const reader = response.body.getReader()
  const parts: ArrayBuffer[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) throw new Error('Community response exceeds its size limit.')
      parts.push(new Uint8Array(value).buffer)
    }
    return new Blob(parts)
  } finally {
    void reader.cancel().catch(() => {})
  }
}

const validHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

export function Marketplace() {
  const [rows, setRows] = useState<Listing[] | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [working, setWorking] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [reporting, setReporting] = useState<string | null>(null)
  const [reason, setReason] = useState('broken')
  const [notes, setNotes] = useState('')
  const active = useRef<AbortController | null>(null)

  useEffect(() => () => active.current?.abort(), [])

  async function run(task: (signal: AbortSignal) => Promise<void>) {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    setWorking(true)
    setError('')
    setStatus('')
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)])
    try {
      await task(signal)
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause))
    } finally {
      active.current = null
      setWorking(false)
    }
  }

  function load() {
    void run(async (signal) => {
      const value: unknown = JSON.parse(await (await fetchBytes('/v1/catalog/mods', 128_000, signal, 'application/json')).text())
      if (!Array.isArray(value) || value.length > 100) throw new Error('Invalid catalog response.')
      const list = value.filter((entry): entry is Listing =>
        !!entry && typeof entry === 'object' && validHash(entry.hash) && Number.isSafeInteger(entry.bytes) &&
        entry.bytes > 0 && entry.bytes <= 12 * 1024 * 1024 &&
        [entry.displayName, entry.author, entry.license, entry.version].every((field) => typeof field === 'string' && field.length <= 160))
      setRows(list)
    })
  }

  function add(hash: string) {
    if (!validHash(hash)) return
    void run(async (signal) => {
      const base = '/v1/catalog/mods/' + hash
      const manifest = JSON.parse(await (await fetchBytes(base, 256_000, signal, 'application/json')).text()) as {
        sha256?: string; rightToDistribute?: boolean; containsPaidRiotContent?: boolean
      }
      if (!manifest || manifest.sha256 !== hash || manifest.rightToDistribute !== true || manifest.containsPaidRiotContent !== false) {
        throw new Error('The package is missing required rights or has a mismatched checksum.')
      }
      const bytes = await fetchBytes(base + '/download', 12 * 1024 * 1024, signal, 'application/zip')
      const archive = await readFileBase64(new File([bytes], hash + '.zip'))
      signal.throwIfAborted()
      await invokeTauri('mod_import', { archive, manifest, rightsConfirmed: true })
      setSelected(null)
      setStatus('Verified and added to your local mod library.')
    })
  }

  function report() {
    if (!reporting || !validHash(reporting)) return
    const hash = reporting
    void run(async (signal) => {
      const response = await fetch(catalogOrigin + '/v1/catalog/mods/' + hash + '/report', {
        method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal,
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason, notes }),
      })
      if (!response.ok) throw new Error('Report request returned HTTP ' + response.status + '.')
      setReporting(null)
      setNotes('')
      setStatus('Report submitted to the community operator.')
    })
  }

  return (
    <>
      <h2>Community catalog</h2>
      <p>Browse packages approved by the community operator. Downloaded packages are verified before entering your local library.</p>
      {!catalogOrigin && <p role="status">This build has no configured community catalog.</p>}
      {catalogOrigin && <div className="customization-actions">
        <button className="btn-primary" disabled={working} onClick={load}>{rows ? 'Refresh approved packages' : 'Load approved packages'}</button>
        {working && <button className="btn-secondary" onClick={() => active.current?.abort()}>Cancel request</button>}
      </div>}
      {working && <p role="status">Working…</p>}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {rows?.length === 0 && <p>No packages have been approved for this catalog.</p>}
      <ul className="customization-list">
        {rows?.map((item) => <li key={item.hash}>
          <strong>{item.displayName} · {item.version}</strong>
          <span>{item.author} · {item.license} · {Math.ceil(item.bytes / 1024)} KiB</span>
          <div className="customization-actions">
            <button className="btn-secondary" disabled={working} onClick={() => { setReporting(item.hash); setNotes('') }}>Report issue</button>
            {selected === item.hash ? <>
              <button className="btn-primary" disabled={working} onClick={() => add(item.hash)}>Download and verify</button>
              <button className="btn-secondary" disabled={working} onClick={() => setSelected(null)}>Back</button>
            </> : <button className="btn-secondary" disabled={working} onClick={() => setSelected(item.hash)}>Review download</button>}
          </div>
          {reporting === item.hash && <form className="customization-editor" onSubmit={(event) => { event.preventDefault(); report() }}>
            <label>Reason <select value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="broken">Broken package</option><option value="copyright">Rights concern</option>
              <option value="malware">Unsafe content</option><option value="other">Other</option>
            </select></label>
            <label>Details <textarea maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
            <p>Your report goes to the community operator. Keep account credentials and personal information out of the details.</p>
            <div className="customization-actions">
              <button className="btn-primary" disabled={working}>Submit report</button>
              <button type="button" className="btn-secondary" disabled={working} onClick={() => setReporting(null)}>Cancel</button>
            </div>
          </form>}
        </li>)}
      </ul>
    </>
  )
}
