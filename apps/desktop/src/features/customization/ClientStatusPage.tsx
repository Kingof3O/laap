import { useEffect, useState } from 'react'
import { invokeTauri } from '../../lib/api'
import {
  errorMessage,
  inGameRunner,
  type InGameRunnerStatus,
} from './api'

type Status = { connected: boolean; phase: string | null }

export function ClientStatusPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [consent, setConsent] = useState(false)
  const [autoPoll, setAutoPoll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [runnerStatus, setRunnerStatus] = useState<InGameRunnerStatus | null>(null)
  const [monitorBusy, setMonitorBusy] = useState(false)

  async function readClientStatus(currentConsent = consent) {
    if (!currentConsent) return
    setBusy(true)
    setError('')
    try {
      const next = await invokeTauri<Status>('gameflow_status', { consent: currentConsent })
      setStatus(next)
      const polled = await inGameRunner.pollNow(currentConsent)
      setRunnerStatus(polled)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function refreshRunnerStatus() {
    try {
      setRunnerStatus(await inGameRunner.getStatus())
    } catch {
      // Read-only monitor may be unavailable in non-Studio builds.
    }
  }

  useEffect(() => {
    void refreshRunnerStatus()
  }, [])

  useEffect(() => {
    if (!consent || !autoPoll) return
    const timer = setInterval(() => {
      void readClientStatus(true)
    }, 2000)
    return () => clearInterval(timer)
  }, [consent, autoPoll])

  async function handleConsentChange(checked: boolean) {
    setConsent(checked)
    setError('')
    if (!checked) {
      setAutoPoll(false)
      setStatus(null)
      if (runnerStatus?.enabled) {
        try {
          await inGameRunner.setEnabled(false, false)
        } catch {
          // Ignore teardown error on opt-out.
        }
      }
      await refreshRunnerStatus()
    }
  }

  async function toggleBackgroundMonitor(enable: boolean) {
    setMonitorBusy(true)
    setError('')
    try {
      await inGameRunner.setEnabled(enable, consent)
      if (enable && consent) {
        await readClientStatus(true)
      } else {
        await refreshRunnerStatus()
      }
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setMonitorBusy(false)
    }
  }

  async function clearLogs() {
    try {
      await inGameRunner.clearLogs()
      await refreshRunnerStatus()
    } catch {
      // Ignore
    }
  }

  const matchedLoadout = runnerStatus?.resolvedLoadout

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <h2>League client status</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Read-only League client connection, gameflow phase, and Champion Select reference lookup. Local client credentials stay in native memory.
      </p>

      <p className="customization-source" style={{ marginBottom: '1.25rem' }}>
        Game integrity & policy: Paid-skin unlocking, DLL hijacking, LTK validator bypasses, memory hooking, automatic accept, and auto-lock are strictly excluded. LAAP does not modify active League matches.
      </p>

      <div className="customization-filters" style={{ marginBottom: '1rem' }}>
        <label className="customization-check">
          <input
            type="checkbox"
            checked={consent}
            disabled={busy || monitorBusy}
            onChange={(event) => void handleConsentChange(event.target.checked)}
          />
          {' '}Allow read-only access to my running League client.
        </label>

        {consent && (
          <label className="customization-check">
            <input
              type="checkbox"
              checked={autoPoll}
              disabled={busy}
              onChange={(event) => setAutoPoll(event.target.checked)}
            />
            {' '}Auto-poll every 2s
          </label>
        )}
      </div>

      <div className="customization-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <button
          className="btn-primary"
          disabled={!consent || busy}
          onClick={() => void readClientStatus(consent)}
        >
          {busy ? 'Checking client…' : 'Read client status'}
        </button>

        {(consent || runnerStatus?.enabled) && (
          <button
            type="button"
            className="btn-secondary"
            disabled={monitorBusy || (!consent && !runnerStatus?.enabled)}
            onClick={() => void toggleBackgroundMonitor(!(runnerStatus?.enabled ?? false))}
          >
            {runnerStatus?.enabled ? 'Stop background observer' : 'Start background observer'}
          </button>
        )}
      </div>

      {error && <p role="alert" style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</p>}

      {(status || runnerStatus?.enabled) && (
        <div
          className="customization-card"
          style={{
            padding: '1.25rem 1.5rem',
            borderRadius: '10px',
            marginBottom: '1.5rem',
            border: '1px solid var(--border-color)',
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.05rem' }}>
            Read-only client &amp; gameflow observation
          </h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '12px',
            }}
          >
            <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>League Client</div>
              <div style={{ fontWeight: 600, marginTop: '2px', color: (status?.connected || runnerStatus?.clientConnected) ? '#10b981' : '#f59e0b' }}>
                {(status?.connected || runnerStatus?.clientConnected) ? '● Running & Connected' : '○ Not Detected'}
              </div>
            </div>

            <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Gameflow Phase</div>
              <div style={{ fontWeight: 600, marginTop: '2px', color: 'var(--color-accent-400)' }}>
                {status?.phase ?? runnerStatus?.gameflowPhase ?? 'None / Offline'}
              </div>
            </div>

            <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Selected Champion</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>
                {runnerStatus?.detectedChampionName
                  ? `${runnerStatus.detectedChampionName} (ID: ${runnerStatus.detectedChampionId})`
                  : 'None detected'}
              </div>
            </div>

            <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Saved Reference</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>
                {matchedLoadout
                  ? `${matchedLoadout.skinOrModName} (${matchedLoadout.source})`
                  : 'None'}
              </div>
              {matchedLoadout && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {matchedLoadout.limitation}
                </div>
              )}
            </div>

            <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>In-Game Adapter</div>
              <div style={{ fontWeight: 600, marginTop: '2px', color: '#f59e0b' }}>
                ○ Unavailable (Not applied in-game)
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {runnerStatus?.adapterStatus ?? 'No approved live overlay adapter configured; official Riot skins cannot be unlocked in-game.'}
              </div>
            </div>
          </div>

          {(status?.phase ?? runnerStatus?.gameflowPhase) === 'ChampSelect' && (
            <p role="status" style={{ marginTop: '1rem', marginBottom: 0 }}>
              Champion select is active. Saved catalog presets are preview/organization metadata only and are not injected into League.
            </p>
          )}
          {(status?.phase ?? runnerStatus?.gameflowPhase) === 'InProgress' && (
            <p role="status" style={{ marginTop: '1rem', marginBottom: 0 }}>
              Active match in progress. LAAP performs zero in-game file replacement or memory modification; your Riot account&apos;s owned skin selection is shown in-game.
            </p>
          )}
          {(status?.phase ?? runnerStatus?.gameflowPhase) === 'ReadyCheck' && (
            <p role="status" style={{ marginTop: '1rem', marginBottom: 0 }}>
              A match is ready. Respond in the official League client.
            </p>
          )}
        </div>
      )}

      <div
        className="customization-card"
        style={{
          padding: '1rem 1.25rem',
          borderRadius: '8px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Read-Only Observation Log</h4>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '2px 8px', fontSize: '0.75rem' }}
            onClick={() => void clearLogs()}
          >
            Clear Log
          </button>
        </div>

        {runnerStatus?.recentEvents && runnerStatus.recentEvents.length > 0 ? (
          <div
            style={{
              maxHeight: '180px',
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              padding: '8px 12px',
              borderRadius: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {runnerStatus.recentEvents.map((evt, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  [{new Date(evt.timestamp).toLocaleTimeString()}]
                </span>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                  {evt.eventType}:
                </span>
                <span style={{ color: 'var(--text-primary)' }}>{evt.message}</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            No events recorded yet. Grant read-only permission above to inspect your running League client.
          </p>
        )}
      </div>
    </div>
  )
}
