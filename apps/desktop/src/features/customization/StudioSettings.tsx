import { useState } from 'react'
import { SETTINGS_CATEGORIES, SettingsNavRail, type SettingsCategory } from '../../shared/ui/settings/SettingsNavRail'
import { AppearanceSettings } from '../../shared/ui/settings/AppearanceSettings'
import { UpdatesSettings } from '../../shared/ui/settings/UpdatesSettings'
import { AboutSettings } from '../../shared/ui/settings/AboutSettings'
import type { useUpdateChecker } from '../../hooks/useUpdateChecker'

type UpdateController = ReturnType<typeof useUpdateChecker>
const categories = SETTINGS_CATEGORIES.filter((category) => ['general', 'appearance', 'updates', 'about'].includes(category.id))

export function StudioSettings({ update, onOpenRelease, onClose }: {
  update: UpdateController
  onOpenRelease: () => void
  onClose: () => void
}) {
  const [active, setActive] = useState<SettingsCategory>('general')
  return <section className="studio-settings" aria-label="Studio settings">
    <div className="customization-heading"><h2>Studio settings</h2><button className="btn-secondary" onClick={onClose}>Return to Studio</button></div>
    <div className="settings-layout">
      <SettingsNavRail activeCategory={active} onSelectCategory={setActive} categories={categories} hasUpdate={update.updateAvailable} />
      <div className="settings-content-pane settings-body">
        {active === 'general' && <div className="settings-section">
          <h3>General</h3>
          <p>LAAP Studio · v{update.currentVersion}</p>
          <p>Your catalog, presets, creator content and settings are stored locally. Read-only client access and community connections have separate permission controls.</p>
          <label className="customization-check"><input type="checkbox" checked={update.autoCheckOnLaunch} onChange={(event) => update.setAutoCheckOnLaunch(event.target.checked)} /> Check for updates on startup</label>
          {update.checkError && <p role="alert">{update.checkError}</p>}
        </div>}
        {active === 'appearance' && <AppearanceSettings showRosterLayout={false} />}
        {active === 'updates' && <UpdatesSettings
          currentVersion={update.currentVersion} checking={update.checking} lastChecked={update.lastChecked}
          updateAvailable={update.updateAvailable} latestRelease={update.latestRelease} status={update.status}
          downloadProgress={update.downloadProgress} installError={update.installError}
          autoCheckOnLaunch={update.autoCheckOnLaunch} onToggleAutoCheck={update.setAutoCheckOnLaunch}
          onCheckUpdates={() => update.checkForUpdates(true).then(() => {})}
          onInstallUpdate={update.downloadAndInstallUpdate} onOpenReleaseModal={onOpenRelease}
        />}
        {active === 'about' && <AboutSettings currentVersion={update.currentVersion} />}
      </div>
    </div>
  </section>
}
