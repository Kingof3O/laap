import { useEffect, useState } from 'react'
import { invokeTauri } from '../../lib/api'
import {
  errorMessage,
  inGameRunner,
  type InGameRunnerConfig,
  type InGameRunnerStatus,
} from './api'

type Status = { connected: boolean; phase: string | null }

export function ClientStatusPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [consent, setConsent] = useState(true)
  const [autoPoll, setAutoPoll] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // In-Game Runner states
  const [runnerStatus, setRunnerStatus] = useState<InGameRunnerStatus | null>(null)
  const [runnerConfig, setRunnerConfig] = useState<InGameRunnerConfig | null>(null)
  const [toolPathInput, setToolPathInput] = useState('')
  const [runnerBusy, setRunnerBusy] = useState(false)
  const [configSaved, setConfigSaved] = useState('')

  async function readClientStatus() {
    setBusy(true)
    setError('')
    try {
      setStatus(await invokeTauri<Status>('gameflow_status', { consent }))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function refreshRunnerStatus() {
    try {
      const s = await inGameRunner.getStatus()
      setRunnerStatus(s)
    } catch {
      // In-game runner may not be available in basic edition
    }
  }

  async function loadRunnerConfig() {
    try {
      const cfg = await inGameRunner.getConfig()
      setRunnerConfig(cfg)
      setToolPathInput(cfg.customOverlayToolPath ?? '')
    } catch {
      // Fallback if not configured
    }
  }

  useEffect(() => {
    void readClientStatus()
    void loadRunnerConfig()
    void refreshRunnerStatus()
  }, [])

  useEffect(() => {
    if (!consent || !autoPoll) return
    const timer = setInterval(() => {
      void readClientStatus()
      void refreshRunnerStatus()
    }, 2000)
    return () => clearInterval(timer)
  }, [consent, autoPoll])

  async function toggleAutoMount(enable: boolean) {
    setRunnerBusy(true)
    setError('')
    try {
      await inGameRunner.setEnabled(enable)
      await refreshRunnerStatus()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setRunnerBusy(false)
    }
  }

  async function saveConfig() {
    if (!runnerConfig) return
    setRunnerBusy(true)
    setConfigSaved('')
    try {
      const updated: InGameRunnerConfig = {
        ...runnerConfig,
        customOverlayToolPath: toolPathInput.trim() ? toolPathInput.trim() : null,
      }
      await inGameRunner.saveConfig(updated)
      setRunnerConfig(updated)
      setConfigSaved('Configuration saved successfully.')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setRunnerBusy(false)
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

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <h2>League Client & In-Game Automation</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        Passive, zero-interaction in-game skin & mod mounting. Automatically detects your champion in Champion Select, matches your active preset or mod, and mounts the virtual filesystem overlay without any manual intervention.
      </p>

      {/* MASTER ZERO-INTERACTION TOGGLE CARD */}
      <div
        className="customization-card"
        style={{
          padding: '1.25rem 1.5rem',
          borderRadius: '10px',
          marginBottom: '1.5rem',
          border: runnerStatus?.enabled
            ? '1px solid rgba(16, 185, 129, 0.4)'
            : '1px solid var(--border-color)',
          background: runnerStatus?.enabled
            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(20, 20, 30, 0.95) 100%)'
            : 'var(--surface-color)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: runnerStatus?.enabled ? '#10b981' : '#6b7280',
                  boxShadow: runnerStatus?.enabled ? '0 0 8px #10b981' : 'none',
                }}
              />
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                Automated In-Game Skin Mounting
              </h3>
            </div>
            <p style={{ margin: '0.4rem 0 0 1.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              {runnerStatus?.enabled
                ? 'Active: Monitoring gameflow in background. Skins will mount automatically when a match begins.'
                : 'Disabled: Enable this to play with skins/chromas without opening any third-party tools.'}
            </p>
          </div>

          <label
            className="customization-check"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '20px',
              backgroundColor: runnerStatus?.enabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              cursor: 'pointer',
              userSelect: 'none',
              fontWeight: 600,
            }}
          >
            <input
              type="checkbox"
              checked={runnerStatus?.enabled ?? false}
              disabled={runnerBusy}
              onChange={(e) => void toggleAutoMount(e.target.checked)}
            />
            {runnerStatus?.enabled ? 'Auto-Mount Enabled' : 'Enable Auto-Mount'}
          </label>
        </div>

        {/* REAL-TIME STATUS BADGES */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            marginTop: '1.25rem',
            paddingTop: '1rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          {/* CLIENT CONNECTION */}
          <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>League Client</div>
            <div style={{ fontWeight: 600, marginTop: '2px', color: status?.connected ? '#10b981' : '#f59e0b' }}>
              {status?.connected ? '● Running & Connected' : '○ Not Detected'}
            </div>
          </div>

          {/* GAMEFLOW PHASE */}
          <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Gameflow Phase</div>
            <div style={{ fontWeight: 600, marginTop: '2px', color: 'var(--color-accent-400)' }}>
              {status?.phase ?? 'None / Offline'}
            </div>
          </div>

          {/* DETECTED CHAMPION */}
          <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Locked Champion</div>
            <div style={{ fontWeight: 600, marginTop: '2px' }}>
              {runnerStatus?.detectedChampionName
                ? `${runnerStatus.detectedChampionName} (ID: ${runnerStatus.detectedChampionId})`
                : 'Waiting for pick…'}
            </div>
          </div>

          {/* RESOLVED SKIN / LOADOUT */}
          <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Active Skin / Mod</div>
            <div style={{ fontWeight: 600, marginTop: '2px', color: runnerStatus?.resolvedLoadout ? '#38bdf8' : 'var(--text-secondary)' }}>
              {runnerStatus?.resolvedLoadout
                ? `${runnerStatus.resolvedLoadout.skinOrModName} (${runnerStatus.resolvedLoadout.source})`
                : 'Default Skin'}
            </div>
          </div>

          {/* OVERLAY MOUNT STATE */}
          <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>In-Game Overlay</div>
            <div style={{ fontWeight: 600, marginTop: '2px', color: runnerStatus?.mountActive ? '#10b981' : 'var(--text-secondary)' }}>
              {runnerStatus?.mountActive
                ? `● Mounted ${runnerStatus.activePid ? `(PID: ${runnerStatus.activePid})` : '(Native Staging)'}`
                : '○ Inactive'}
            </div>
          </div>
        </div>
      </div>

      {/* ADVANCED SETTINGS ACCORDION */}
      <details
        className="customization-card"
        style={{
          padding: '1rem 1.25rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
        }}
      >
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>
          Advanced Overlay Settings & Custom Tool Path (Optional)
        </summary>
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            By default, LAAP automatically stages skins natively in its isolated staging sandbox. If you prefer to bind a specific external headless worker executable (such as <code>mod-tools.exe</code> or <code>cslol-cli.exe</code>), you can specify its local absolute path below. It will run completely invisibly in the background.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="e.g. C:\Tools\mod-tools.exe (leave blank for native staging)"
              value={toolPathInput}
              onChange={(e) => setToolPathInput(e.target.value)}
              style={{ flex: 1, padding: '6px 12px', fontSize: '0.9rem' }}
            />
            <button className="btn-secondary" disabled={runnerBusy} onClick={() => void saveConfig()}>
              Save Path
            </button>
          </div>
          {configSaved && <p style={{ fontSize: '0.85rem', color: '#10b981', margin: 0 }}>{configSaved}</p>}
        </div>
      </details>

      {/* LIVE ACTIVITY EVENT LOG */}
      <div
        className="customization-card"
        style={{
          padding: '1rem 1.25rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Live In-Game Automation Log</h4>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '2px 8px', fontSize: '0.75rem' }}
              onClick={() => void inGameRunner.pollNow().then(setRunnerStatus)}
            >
              Poll Now
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '2px 8px', fontSize: '0.75rem' }}
              onClick={() => void clearLogs()}
            >
              Clear Log
            </button>
          </div>
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
                <span
                  style={{
                    color:
                      evt.eventType === 'MOUNTED' || evt.eventType === 'CHAMP_LOCKED'
                        ? '#10b981'
                        : evt.eventType === 'ERROR'
                        ? '#ef4444'
                        : '#38bdf8',
                    fontWeight: 600,
                  }}
                >
                  {evt.eventType}:
                </span>
                <span style={{ color: 'var(--text-primary)' }}>{evt.message}</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            No recent gameflow events. Enable auto-mount to begin monitoring.
          </p>
        )}
      </div>

      {/* SAFETY & COMPLIANCE NOTICE */}
      <p className="customization-source" style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
        <strong>Vanguard & Integrity Guarantee:</strong> LAAP never hooks game memory, injects Win32 DLLs, or modifies running League processes. All in-game skin applications use non-invasive virtual filesystem mounting and passive LCU loopback detection, keeping your Riot account and hardware fully protected.
      </p>

      {error && <p role="alert" style={{ color: '#ef4444', marginTop: '0.5rem' }}>{error}</p>}
    </div>
  )
}
