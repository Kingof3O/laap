import { useEffect, useRef, useState } from 'react'
import { errorMessage, mods, type PackageManifest } from './api'

interface Submission { packageHash: string; title: string; creatorName: string; version: string; status: string; moderationNote?: string }
interface Report { id: string; packageHash: string; reason: string; notes: string }
export function ModeratorPanel({ origin }: { origin: string }) {
  const [key, setKey] = useState('')
  const [reportKey, setReportKey] = useState('')
  const [filter, setFilter] = useState('pending_review')
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<Submission[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [inspection, setInspection] = useState<{ hash: string; manifest: PackageManifest; count: number } | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => active.current?.abort(), [])

  async function request(path: string, signal: AbortSignal, body?: unknown, report = false) {
    const response = await fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST', signal,
      headers: { 'Content-Type': 'application/json', ...(report ? { Authorization: `Bearer ${reportKey}` } : { 'X-Admin-Key': key }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) {
      const detail = await response.json().catch(() => null) as { error?: string } | null
      throw Error(detail?.error ?? `Operator request failed (${response.status}). Check the server's operator configuration.`)
    }
    return response.json()
  }
  async function run(work: (signal: AbortSignal) => Promise<void>) {
    if (active.current) return
    const controller = new AbortController(); active.current = controller
    setBusy(true); setError(''); setStatus('')
    const timeout = window.setTimeout(() => controller.abort(), 30000)
    try { await work(controller.signal) }
    catch (cause) { setError(controller.signal.aborted ? 'Request interrupted. Refresh before retrying; a submitted moderation decision may already have committed.' : errorMessage(cause)) }
    finally { clearTimeout(timeout); active.current = null; setBusy(false) }
  }
  async function load(signal: AbortSignal, page = offset) {
    setRows(await request(`/v1/marketplace/mods?status=${filter}&offset=${page}`, signal) as Submission[])
    setOffset(page); setInspection(null)
  }
  async function inspect(row: Submission, signal: AbortSignal) {
    setInspection(null)
    const pkg = await request(`/v1/marketplace/admin/package/${row.packageHash}`, signal) as { manifest: PackageManifest; archiveBase64: string }
    const contents = await mods.listContents(pkg.archiveBase64)
    if (signal.aborted) return
    setInspection({ hash: row.packageHash, manifest: pkg.manifest, count: contents.length })
    setStatus('Stored archive hash and package manifest verified by the service; contents inspected by native LAAP. No files activated or imported.')
  }
  async function decide(row: Submission, action: string, signal: AbortSignal) {
    if (!note.trim()) throw Error('Provide a moderation reason first.')
    await request(`/v1/marketplace/admin/review/${row.packageHash}`, signal, { action, note: note.trim() })
    await load(signal)
    setStatus(`Recorded ${action} decision for ${row.title}.`)
  }
  return <details className="customization-editor creator-workbench">
    <summary>Service operator tools</summary>
    <p>Operator credentials stay in this screen's memory. Creator credentials do not grant moderation access.</p>
    <label>Marketplace operator key<input type="password" autoComplete="off" value={key} onChange={e => { setKey(e.target.value); setRows([]); setInspection(null) }} /></label>
    <label>Queue<select value={filter} disabled={busy} onChange={e => { setFilter(e.target.value); setRows([]); setOffset(0); setInspection(null) }}>
      {['pending_review', 'approved', 'rejected', 'takedown'].map(value => <option key={value}>{value}</option>)}
    </select></label>
    <button className="btn-secondary" disabled={busy || !/^[a-f0-9]{64}$/.test(key)} onClick={() => void run(signal => load(signal, 0))}>Load review queue</button>
    <label>Decision reason<textarea maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label>
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
    <ul className="customization-list">{rows.map(row => <li key={row.packageHash}>
      <strong>{row.title} · {row.version}</strong><span>{row.creatorName} · {row.status}</span><code>{row.packageHash}</code>
      {row.moderationNote && <p>{row.moderationNote}</p>}
      <button className="btn-secondary" disabled={busy} onClick={() => void run(signal => inspect(row, signal))}>Inspect submitted package</button>
      <div className="customization-actions">{(row.status === 'pending_review' ? ['approve', 'reject'] : row.status === 'approved' ? ['takedown'] : row.status === 'takedown' ? ['restore'] : []).map(action =>
        <button key={action} disabled={busy || !note.trim() || (action === 'approve' && inspection?.hash !== row.packageHash)} onClick={() => void run(signal => decide(row, action, signal))}>{action}</button>)}</div>
    </li>)}</ul>
    {inspection && <section aria-label="Submitted content inspection"><h3>{inspection.manifest.displayName}</h3>
      <p>{inspection.manifest.author} · {inspection.manifest.license} · Redistribution: {inspection.manifest.rightToDistribute ? 'Declared' : 'Not granted'}</p>
      <p>{inspection.count} archive entries</p>
      <ul>{inspection.manifest.files.map(file => <li key={file.relativePath}><code>{file.relativePath}</code> · {file.sizeBytes} bytes</li>)}</ul>
    </section>}
    <div className="customization-actions"><button className="btn-secondary" disabled={busy || offset === 0} onClick={() => void run(signal => load(signal, Math.max(0, offset - 50)))}>Previous review page</button>
      <button className="btn-secondary" disabled={busy || rows.length < 50} onClick={() => void run(signal => load(signal, offset + 50))}>Next review page</button></div>
    <label>Safety reports operator token<input type="password" autoComplete="off" value={reportKey} onChange={e => { setReportKey(e.target.value); setReports([]) }} /></label>
    <button className="btn-secondary" disabled={busy || reportKey.length < 32} onClick={() => void run(async signal => setReports(await request('/v1/moderation/reports', signal, undefined, true) as Report[]))}>Load safety reports</button>
    <ul>{reports.map(report => <li key={report.id}><code>{report.packageHash}</code> · {report.reason}: {report.notes}</li>)}</ul>
    {busy && <button onClick={() => active.current?.abort()}>Cancel request</button>}
    <button className="btn-secondary" disabled={busy} onClick={() => { setKey(''); setReportKey(''); setRows([]); setReports([]); setInspection(null); setNote(''); setStatus('Operator credentials cleared.') }}>Clear operator session</button>
  </details>
}
