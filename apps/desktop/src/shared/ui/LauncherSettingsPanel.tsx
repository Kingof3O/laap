import { useEffect, useState } from 'react'
import { Download, FolderSearch, Loader2 } from 'lucide-react'
import type { LauncherController } from '../../hooks/useLauncher'
import { openExternalUrl } from '../../lib/api'
export function LauncherSettingsPanel({
  launcher,
  disabled,
}: {
  launcher: LauncherController
  disabled: boolean
}) {
  const { view, loading, busy, error } = launcher
  const [path, setPath] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [action, setAction] = useState<string | null>(null)
  useEffect(() => {
    if (view && !dirty) {
      setPath(view.settings.riot_client_path ?? '')
      setEnabled(view.settings.presence_enabled)
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
      {view.presence_supported ? (
        <>
          <h3>LAAP Presence</h3>
          <p>
            Choose Online or Appear offline before login, then change it from
            the header while logged in. Lobby chat remains available.
          </p>
          <p>
            Prepare the local chat certificate once. Setup needs internet
            access; the certificate is cached on this device.
          </p>
          <button
            type="button"
            className="btn-modal-secondary"
            disabled={disabled || busy}
            onClick={() =>
              void invoke('Preparing presence controls…', launcher.prepare)
            }
          >
            {action?.startsWith('Preparing') ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}{' '}
            {view.presence_ready
              ? 'Refresh presence setup'
              : 'Prepare presence controls'}
          </button>
          <button
            type="button"
            className="btn-modal-secondary"
            onClick={() =>
              void openExternalUrl(
                'https://github.com/Kingof3O/laap/blob/main/docs/riot-installation-and-presence.md',
              )
            }
          >
            Presence setup guide
          </button>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => {
                setEnabled(event.target.checked)
                setDirty(true)
                setSaved(false)
              }}
              disabled={disabled || busy || !view.presence_ready}
            />{' '}
            Enable LAAP Presence for future logins
          </label>
          <p>
            A client opened normally needs one restart to enable the presence
            filter. Later status changes do not restart your game. Keep LAAP
            open or minimized while using presence controls.
          </p>
        </>
      ) : (
        <p>LAAP Presence is available on Windows.</p>
      )}
      <button
        type="button"
        className="btn-modal-primary"
        disabled={disabled || busy || !dirty}
        onClick={() =>
          void invoke('Saving launcher settings…', async () => {
            await launcher.save(path, enabled)
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
