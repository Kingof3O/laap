import { useState } from 'react'
import { SETTINGS_CATEGORIES, SettingsNavRail, type SettingsCategory } from '../../shared/ui/settings/SettingsNavRail'
import { AppearanceSettings } from '../../shared/ui/settings/AppearanceSettings'
import { UpdatesSettings } from '../../shared/ui/settings/UpdatesSettings'
import { AboutSettings } from '../../shared/ui/settings/AboutSettings'
import type { useUpdateChecker } from '../../hooks/useUpdateChecker'

type UpdateController = ReturnType<typeof useUpdateChecker>
const categories = SETTINGS_CATEGORIES.filter((category) => ['general', 'appearance', 'updates', 'advanced', 'about'].includes(category.id))

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
        {active === 'advanced' && <div className="settings-section">
          <h3>Integrations & Entitlements</h3>
          <p>Configure optional external services and inspect commercial entitlement status.</p>
          <div className="customization-card" style={{ marginTop: '1rem', padding: '1rem' }}>
            <strong>Discord Rich Presence</strong>
            <p className="customization-source">Status: Inactive (requires registered Discord Application Client ID). Personal activity stays local until enabled.</p>
          </div>
          <div className="customization-card" style={{ marginTop: '1rem', padding: '1rem' }}>
            <strong>Authorized Stats API</strong>
            <p className="customization-source">Status: Inactive (requires approved stats provider API key). Scraped or private endpoints are strictly excluded.</p>
          </div>
          <div className="customization-card" style={{ marginTop: '1rem', padding: '1rem' }}>
            <strong>AI & Voice Companion (TTS)</strong>
            <p className="customization-source">Status: Inactive (requires user-owned API key or authorized server proxy). No shared secrets are embedded in client binaries.</p>
          </div>
          <div className="customization-card" style={{ marginTop: '1rem', padding: '1rem' }}>
            <strong>Commercial Entitlements & Licensing</strong>
            <p className="customization-source">Edition: Free Core (Basic is free forever). Paid checkout and commercial activation are GATED pending Riot Developer Portal product review and Merchant of Record onboarding.</p>
          </div>
        </div>}
        {active === 'about' && <AboutSettings currentVersion={update.currentVersion} />}
      </div>
    </div>
  </section>
}
