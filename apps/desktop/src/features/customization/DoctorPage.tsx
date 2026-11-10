import { useEffect, useState } from 'react'
import { invokeTauri } from '../../lib/api'
import { errorMessage } from './api'

type Report = {
  checks: Array<{ name: string; healthy: boolean; detail: string }>
  mediaBytes: number
  mediaFiles: number
}

export function DoctorPage() {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)

  async function refresh() {
    setBusy(true)
    setError('')
    try { setReport(await invokeTauri<Report>('doctor_collect')) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  useEffect(() => { void refresh() }, [])

  async function clear() {
    setBusy(true)
    setError('')
    try {
      await invokeTauri('catalog_clear_media_cache')
      setConfirm(false)
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause))
      setBusy(false)
    }
  }

  return <>
    <div className="customization-heading"><div><h2>Workspace health</h2><p>Check installed content, local persistence, and integration readiness.</p></div>
      <button className="btn-secondary" disabled={busy} onClick={() => void refresh()}>{busy ? 'Checking…' : 'Run checks'}</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {report && <>
      <ul className="customization-list">{report.checks.map((check) =>
        <li key={check.name}><strong>{check.name} · {check.healthy ? 'Ready' : 'Needs attention'}</strong><span>{check.detail}</span></li>)}</ul>
      <h3>Downloaded preview cache</h3><p>{report.mediaFiles.toLocaleString()} files · {(report.mediaBytes / 1024 / 1024).toFixed(1)} MiB</p>
      <p>Clearing downloaded previews preserves your bundled catalog, original content packages, and saved presets.</p>
      <div className="customization-actions">
        {confirm ? <>
          <button className="btn-secondary" disabled={busy} onClick={() => void clear()}>Confirm clear previews</button>
          <button className="btn-secondary" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button>
        </> : <button className="btn-secondary" disabled={busy} onClick={() => setConfirm(true)}>Clear downloaded previews</button>}
      </div>
    </>}
  </>
}
