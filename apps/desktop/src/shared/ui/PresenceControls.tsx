import type { LauncherController, PresenceMode } from '../../hooks/useLauncher'
import { Loader2, RefreshCw } from 'lucide-react'
export function PresenceSelect({ launcher }: { launcher: LauncherController }) {
  if (
    !launcher.view?.presence_supported ||
    !launcher.view.settings.presence_enabled
  )
    return null
  return (
    <label className="presence-select">
      <span>Presence</span>
      <select
        aria-label="Online presence"
        value={
          launcher.presence?.desired_mode ??
          launcher.view.settings.presence_mode
        }
        disabled={launcher.busy}
        onChange={(event) =>
          void launcher
            .changeMode(event.target.value as PresenceMode)
            .catch(() => {})
        }
      >
        <option value="online">Online</option>
        <option value="offline">Appear offline</option>
      </select>
    </label>
  )
}
export function PresenceBanner({
  launcher,
  operationBusy,
}: {
  launcher: LauncherController
  operationBusy: boolean
}) {
  if (
    !launcher.view?.presence_supported ||
    !launcher.view.settings.presence_enabled
  )
    return null
  const status = launcher.presence
  return (
    <div
      className={`presence-status presence-status-${status?.state ?? 'waiting'}`}
      role="status"
      aria-live="polite"
      aria-busy={launcher.busy}
    >
      <span>
        {launcher.busy ? <Loader2 size={14} className="animate-spin" /> : null}{' '}
        {launcher.error ??
          (launcher.busy
            ? 'Applying presence…'
            : (status?.message ?? 'Checking presence…'))}
      </span>
      {status?.state === 'restart_required' ? (
        <button
          type="button"
          className="btn-modal-secondary"
          disabled={launcher.busy || operationBusy}
          onClick={() => void launcher.restart()}
        >
          Restart Riot with presence controls
        </button>
      ) : null}
      {status?.state === 'error' || launcher.error ? (
        <button
          type="button"
          className="btn-modal-secondary"
          disabled={launcher.busy}
          onClick={() => void launcher.retry().catch(() => {})}
        >
          <RefreshCw size={13} /> Retry presence
        </button>
      ) : null}
    </div>
  )
}
