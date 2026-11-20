import { useEffect, useState } from 'react'
import { invokeTauri, isTauriAvailable } from '../../../lib/api'

export function GeneralSettings({ windows, busy }: { windows: boolean; busy: boolean }) {
  const [autoLaunch, setAutoLaunch] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!windows || !isTauriAvailable()) return
    let mounted = true
    void invokeTauri<boolean>('get_auto_launch').then((enabled) => {
      if (mounted && typeof enabled === 'boolean') setAutoLaunch(enabled)
    }).catch(() => {
      if (mounted) setError('Windows startup preference is unavailable.')
    })
    return () => { mounted = false }
  }, [windows])

  const changeAutoLaunch = async (enabled: boolean) => {
    setSaving(true)
    setError(null)
    try {
      setAutoLaunch(await invokeTauri<boolean>('set_auto_launch', { enabled }))
    } catch {
      setError('Could not save the Windows startup preference.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-section" aria-label="General settings">
      <div className="settings-section-header">
        <h3 className="settings-section-title">General</h3>
        <p className="settings-section-desc">Startup and window behavior.</p>
      </div>
      {windows ? (
        <div className="settings-card settings-info-card">
          <label className="settings-option-row">
            <span><strong>Start LAAP with Windows</strong><small>Open LAAP when you sign in to Windows.</small></span>
            <input type="checkbox" aria-label="Start LAAP with Windows" checked={autoLaunch ?? false}
              disabled={busy || saving || autoLaunch === null}
              onChange={(event) => void changeAutoLaunch(event.target.checked)} />
          </label>
          {error ? <p role="alert">{error}</p> : null}
        </div>
      ) : null}
      <div className="settings-card settings-info-card">
        <h4>System tray</h4>
        <p>Closing the window keeps LAAP in the system tray so you can reopen it or switch profiles. Use Quit in the tray menu to exit.</p>
      </div>
    </div>
  )
}
