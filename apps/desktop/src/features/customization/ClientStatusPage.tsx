import { useEffect, useState } from 'react'
import { invokeTauri } from '../../lib/api'
import { errorMessage } from './api'

type Status = { connected: boolean; phase: string | null }

export function ClientStatusPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [consent, setConsent] = useState(false)
  const [autoPoll, setAutoPoll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function read() {
    setBusy(true)
    setError('')
    try { setStatus(await invokeTauri<Status>('gameflow_status', { consent })) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  useEffect(() => {
    if (!consent || !autoPoll) return
    const timer = setInterval(() => {
      void read()
    }, 5000)
    return () => clearInterval(timer)
  }, [consent, autoPoll])

  return <>
    <h2>League client status</h2>
    <p>Read the client connection and gameflow phase on this computer. Local client credentials stay in native memory.</p>
    <p className="customization-source">Game integrity & policy: Automatic accept, auto-lock, and memory hooking are strictly excluded. All monitoring is passive, read-only LCU lockfile inspection.</p>
    <div className="customization-filters">
      <label className="customization-check"><input type="checkbox" checked={consent} disabled={busy} onChange={(event) => {
        setConsent(event.target.checked); setStatus(null); setError('')
        if (!event.target.checked) setAutoPoll(false)
      }} /> Allow read-only access to my running League client.</label>
      {consent && (
        <label className="customization-check"><input type="checkbox" checked={autoPoll} onChange={(e) => setAutoPoll(e.target.checked)} /> Auto-poll every 5s</label>
      )}
    </div>
    <div className="customization-actions">
      <button className="btn-primary" disabled={!consent || busy} onClick={() => void read()}>{busy ? 'Checking client…' : 'Read client status'}</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {status && <section className="customization-editor">
      <h3>{status.connected ? 'Client connected' : 'League client is not running'}</h3>
      {status.phase && <p>Gameflow phase · <strong>{status.phase}</strong></p>}
      {status.phase === 'ChampSelect' && <p role="status">Champion select is active. Explore the catalog to view local presets.</p>}
      {status.phase === 'InProgress' && <p role="status">Active match in progress. Native operations defer to preserve game performance.</p>}
      {status.phase === 'ReadyCheck' && <p role="status">A match is ready. Respond in the official League client.</p>}
      <p className="customization-source">Platform status: Active read-only connection. External client injection adapter is gated and inactive.</p>
    </section>}
  </>
}
