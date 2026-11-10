import { useState } from 'react'
import { invokeTauri } from '../../lib/api'
import { errorMessage } from './api'

type Status = { connected: boolean; phase: string | null }

export function ClientStatusPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function read() {
    setBusy(true)
    setError('')
    try { setStatus(await invokeTauri<Status>('gameflow_status', { consent })) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  return <>
    <h2>League client status</h2>
    <p>Read the client connection and gameflow phase on this computer. Local client credentials stay in native memory.</p>
    <label className="customization-check"><input type="checkbox" checked={consent} disabled={busy} onChange={(event) => {
      setConsent(event.target.checked); setStatus(null); setError('')
    }} /> Allow read-only access to my running League client.</label>
    <div className="customization-actions"><button className="btn-primary" disabled={!consent || busy} onClick={() => void read()}>{busy ? 'Checking client…' : 'Read client status'}</button></div>
    {error && <p role="alert">{error}</p>}
    {status && <section className="customization-editor"><h3>{status.connected ? 'Client connected' : 'League client is not running'}</h3>
      {status.phase && <p>Gameflow phase · {status.phase}</p>}
      {status.phase === 'ReadyCheck' && <p role="status">A match is ready. Respond in the official League client.</p>}
    </section>}
  </>
}
