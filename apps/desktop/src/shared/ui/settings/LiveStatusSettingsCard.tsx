import { useEffect, useState } from 'react'
import { Activity, Cloud, KeyRound, ShieldAlert } from 'lucide-react'
import { hasTauri, invokeTauri } from '../../../lib/api'
import { useToast } from '../../../context/ToastContext'
import type { LiveStatusMode, LiveStatusSettings } from '../../../lib/types'

interface LiveStatusSettingsCardProps {
  busy: boolean
}

const DEFAULT_SETTINGS: LiveStatusSettings = {
  mode: 'off',
  workerUrl: '',
  prelaunchGuard: true,
  hasRiotApiKey: false,
  hasWorkerToken: false,
  envRiotKeyPresent: false,
  builtInWorkerConfigured: false,
}

export function LiveStatusSettingsCard({ busy }: LiveStatusSettingsCardProps) {
  const { showSuccess, showError } = useToast()
  const [settings, setSettings] = useState<LiveStatusSettings>(DEFAULT_SETTINGS)
  const [mode, setMode] = useState<LiveStatusMode>('off')
  const [workerUrl, setWorkerUrl] = useState('')
  const [riotApiKey, setRiotApiKey] = useState('')
  const [workerToken, setWorkerToken] = useState('')
  const [clearRiotKey, setClearRiotKey] = useState(false)
  const [clearWorkerToken, setClearWorkerToken] = useState(false)
  const [prelaunchGuard, setPrelaunchGuard] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!hasTauri) return
    let active = true
    invokeTauri<LiveStatusSettings | null>('get_live_status_settings')
      .then((res) => {
        if (!active || !res) return
        setSettings(res)
        setMode(res.mode)
        setWorkerUrl(res.workerUrl ?? '')
        setPrelaunchGuard(res.prelaunchGuard ?? true)
        setLoaded(true)
      })
      .catch(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [])

  const handleSave = async () => {
    if (!hasTauri) return
    setSaving(true)
    try {
      const updated = await invokeTauri<LiveStatusSettings>(
        'save_live_status_settings',
        {
          input: {
            mode,
            workerUrl,
            prelaunchGuard,
            riotApiKey: riotApiKey.trim() || null,
            clearRiotApiKey: clearRiotKey,
            workerToken: workerToken.trim() || null,
            clearWorkerToken: clearWorkerToken,
          },
        },
      )
      setSettings(updated)
      setMode(updated.mode)
      setWorkerUrl(updated.workerUrl)
      setPrelaunchGuard(updated.prelaunchGuard)
      setRiotApiKey('')
      setWorkerToken('')
      setClearRiotKey(false)
      setClearWorkerToken(false)
      window.dispatchEvent(new CustomEvent('laap:live-status-config', { detail: updated }))
      showSuccess('Live match tracking settings saved.')
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-card">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          marginBottom: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent-400)' }}>
          <Activity size={16} />
          <strong style={{ fontSize: '13px', color: '#FFFFFF' }}>
            Live Match Tracking (Riot Spectator v5)
          </strong>
        </div>
        <span className="profile-panel-badge">
          {mode === 'off' ? 'Off' : mode === 'direct' ? 'Personal Key' : 'Cloudflare Worker'}
        </span>
      </div>

      <p
        style={{
          fontSize: '12px',
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
          margin: '0 0 12px 0',
        }}
      >
        Optional on-demand &amp; pre-launch active game check using Riot&apos;s{' '}
        <code>spectator-v5</code> API (45s cache + PUUID reuse to respect your{' '}
        <code>20/1s · 100/2m</code> rate budget). Never bundles keys in the app.
      </p>

      <div className="live-mode-tabs" role="radiogroup" aria-label="Live match backend mode">
        <button
          type="button"
          className={`live-mode-btn ${mode === 'off' ? 'live-mode-btn-active' : ''}`}
          onClick={() => setMode('off')}
          disabled={busy || saving}
        >
          Off (Zero Network)
        </button>
        <button
          type="button"
          className={`live-mode-btn ${mode === 'direct' ? 'live-mode-btn-active' : ''}`}
          onClick={() => setMode('direct')}
          disabled={busy || saving}
        >
          <KeyRound size={13} /> Personal Key
        </button>
        <button
          type="button"
          className={`live-mode-btn ${mode === 'worker' ? 'live-mode-btn-active' : ''}`}
          onClick={() => setMode('worker')}
          disabled={busy || saving}
        >
          <Cloud size={13} /> Cloudflare Worker
        </button>
      </div>

      {mode === 'direct' && (
        <div className="live-config-fields">
          <label className="form-field">
            <span className="live-field-row">
              <span>Riot Personal API Key</span>
              <span className="live-secret-state">
                {clearRiotKey
                  ? 'Will be removed on save'
                  : settings.hasRiotApiKey
                    ? 'Saved in encrypted vault'
                    : settings.envRiotKeyPresent
                      ? 'Using RIOT_API_KEY env'
                      : 'Not saved'}
              </span>
            </span>
            <input
              type="password"
              value={riotApiKey}
              onChange={(e) => {
                setRiotApiKey(e.target.value)
                if (clearRiotKey) setClearRiotKey(false)
              }}
              placeholder={
                settings.hasRiotApiKey
                  ? 'Leave blank to keep existing key, or paste new RGAPI-…'
                  : 'RGAPI-… (stored encrypted locally)'
              }
              autoComplete="off"
              disabled={busy || saving}
            />
          </label>
          {settings.hasRiotApiKey && !clearRiotKey ? (
            <button
              type="button"
              className="btn-link-subtle"
              onClick={() => {
                setRiotApiKey('')
                setClearRiotKey(true)
              }}
              disabled={busy || saving}
            >
              Clear saved key
            </button>
          ) : null}
        </div>
      )}

      {mode === 'worker' && (
        <div className="live-config-fields">
          <label className="form-field">
            <span>Cloudflare Worker Base URL</span>
            <input
              type="url"
              value={workerUrl}
              onChange={(e) => setWorkerUrl(e.target.value)}
              placeholder="https://laap-api.<your-subdomain>.workers.dev"
              autoComplete="off"
              disabled={busy || saving}
            />
          </label>

          <label className="form-field">
            <span className="live-field-row">
              <span>Worker Auth Secret (HMAC Signing Key)</span>
              <span className="live-secret-state">
                {clearWorkerToken
                  ? 'Will be cleared on save'
                  : settings.hasWorkerToken
                    ? 'Custom key saved securely'
                    : settings.builtInWorkerConfigured
                      ? 'Built-in app signing key active'
                      : 'Not saved'}
              </span>
            </span>
            <input
              type="password"
              value={workerToken}
              onChange={(e) => {
                setWorkerToken(e.target.value)
                if (clearWorkerToken) setClearWorkerToken(false)
              }}
              placeholder={
                settings.hasWorkerToken
                  ? 'Leave blank to keep existing key, or paste new secret'
                  : settings.builtInWorkerConfigured
                    ? 'Using built-in app signing key (paste to override)'
                    : 'Paste shared LAAP_RIOT_PROXY_TOKEN secret'
              }
              autoComplete="off"
              disabled={busy || saving}
            />
          </label>
          {settings.hasWorkerToken && !clearWorkerToken ? (
            <button
              type="button"
              className="btn-link-subtle"
              onClick={() => {
                setWorkerToken('')
                setClearWorkerToken(true)
              }}
              disabled={busy || saving}
            >
              Clear saved token
            </button>
          ) : null}
        </div>
      )}

      {mode !== 'off' && (
        <label className="checkbox-row" style={{ marginTop: '10px' }}>
          <input
            type="checkbox"
            checked={prelaunchGuard}
            onChange={(e) => setPrelaunchGuard(e.target.checked)}
            disabled={busy || saving}
          />
          <span>Warn before launching if the target account is currently in a match</span>
        </label>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          marginTop: '12px',
        }}
      >
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <ShieldAlert size={13} />
          {loaded && !hasTauri ? 'Desktop runtime required' : 'Requests fire only on manual check or launch'}
        </span>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void handleSave()}
          disabled={busy || saving || !hasTauri}
          style={{ height: '34px', padding: '0 14px', fontSize: '12px', fontWeight: 600 }}
        >
          {saving ? 'Saving…' : 'Save Live Settings'}
        </button>
      </div>
    </div>
  )
}
