import { useEffect, useState } from 'react'
import { FolderSearch } from 'lucide-react'
import type { LauncherController, PresenceMode } from '../../hooks/useLauncher'
export function LauncherSettingsPanel({
  launcher,
  disabled,
}: {
  launcher: LauncherController
  disabled: boolean
}) {
  const { view, loading, busy, error } = launcher
  const [path, setPath] = useState('')
  const enabled = true
  const [startupPresence, setStartupPresence] = useState<PresenceMode>('online')
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [action, setAction] = useState<string | null>(null)
  useEffect(() => {
    if (view && !dirty) {
      setPath(view.settings.riot_client_path ?? '')
      setStartupPresence(view.settings.startup_presence ?? 'online')
    }
  }, [view, dirty])
  const invoke = async (label: string, action: () => Promise<unknown>) => {
    setAction(label)
    try {
      await action()
    } catch {
      /* The controller renders the native error. */
    } finally {
      setAction(null)
    }
  }
  if (!view)
    return (
      <section className="launcher-settings-panel">
        <p>
          {loading
            ? 'Finding Riot installation…'
            : (error ?? 'Native launcher settings are unavailable.')}
        </p>
        <button
          className="btn-modal-secondary"
          onClick={() => void launcher.refresh()}
          disabled={loading}
        >
          Retry detection
        </button>
      </section>
    )
  return (
    <section
      className="launcher-settings-panel"
      aria-label="Riot installation and presence"
    >
      <h3>
        <FolderSearch size={16} /> Riot installation
      </h3>
      <p>
        {view.detected_client
          ? `Found using ${view.detected_client.source}`
          : view.detection_error}
      </p>
      {view.detected_client ? (
        <code className="detected-client-path">
          {view.detected_client.path}
        </code>
      ) : null}
      {view.presence_supported ? (
        <>
          <h3>Default presence</h3>
          <label className="field-block">
            <span className="field-label">Default presence on startup</span>
            <select
              className="hextech-input"
              aria-label="Default presence on startup"
              value={startupPresence}
              onChange={(event) => {
                setStartupPresence(event.target.value as PresenceMode)
                setDirty(true)
                setSaved(false)
              }}
              disabled={disabled || busy}
            >
              <option value="online">Online</option>
              <option value="offline">Appear offline</option>
            </select>
          </label>
          <p>Used when LAAP starts. Change the current session anytime from the header or system menu. New installs start Online.</p>
        </>
      ) : null}
      {view.windows ? (
        <>
          <label className="field-block">
            <span className="field-label">
              Riot Client path override (optional)
            </span>
            <input
              className="hextech-input"
              value={path}
              onChange={(event) => {
                setPath(event.target.value)
                setDirty(true)
                setSaved(false)
              }}
              disabled={disabled || busy}
              placeholder={'E:\\Games\\Riot Client\\RiotClientServices.exe'}
            />
          </label>
          <p>
            Leave empty to detect Riot’s installation record, running client,
            registry and install folders.
          </p>
        </>
      ) : null}
      <button
        type="button"
        className="btn-modal-primary"
        disabled={disabled || busy || !dirty}
        onClick={() =>
          void invoke('Saving launcher settings…', async () => {
            await launcher.save(path, enabled, startupPresence)
            setDirty(false)
            setSaved(true)
          })
        }
      >
        Save launcher settings
      </button>
      {saved ? <p role="status">Launcher settings saved.</p> : null}
      {action ? <p role="status">{action}</p> : null}
      {error ? (
        <p className="profile-form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="btn-modal-secondary"
        disabled={busy || loading}
        onClick={() => void launcher.refresh()}
      >
        Detect again
      </button>
    </section>
  )
}
