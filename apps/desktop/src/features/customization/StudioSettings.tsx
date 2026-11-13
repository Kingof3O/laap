import { useEffect, useState } from 'react'
import { SETTINGS_CATEGORIES, SettingsNavRail, type SettingsCategory } from '../../shared/ui/settings/SettingsNavRail'
import { AppearanceSettings } from '../../shared/ui/settings/AppearanceSettings'
import { UpdatesSettings } from '../../shared/ui/settings/UpdatesSettings'
import { AboutSettings } from '../../shared/ui/settings/AboutSettings'
import { discord } from './api'
import { ProviderSettings } from './ProviderSettings'
import { GameAdapterSettingsPanel } from './GameAdapterSettingsPanel'
import { useI18n } from '../../context/I18nContext'
import type { useUpdateChecker } from '../../hooks/useUpdateChecker'

type UpdateController = ReturnType<typeof useUpdateChecker>
const categories = SETTINGS_CATEGORIES.filter((category) => ['general', 'appearance', 'updates', 'advanced', 'about'].includes(category.id))

export function StudioSettings({ update, onOpenRelease, onClose }: {
  update: UpdateController
  onOpenRelease: () => void
  onClose: () => void
}) {
  const [active, setActive] = useState<SettingsCategory>('general')
  const { locale, setLocale, t, locales } = useI18n()

  // Discord State
  const [discordEnabled, setDiscordEnabled] = useState(false)
  const [discordClientId, setDiscordClientId] = useState('')
  const [discordStatus, setDiscordStatus] = useState('')
  const [discordBusy, setDiscordBusy] = useState(false)
  useEffect(() => {
    let current = true
    void discord.status().then(value => { if (current) {
      setDiscordClientId(value.clientId ?? ''); setDiscordEnabled(value.enabled)
      setDiscordStatus(value.connected ? 'Connected to Discord desktop IPC.' : value.enabled ? 'Presence preference is enabled, but Discord is disconnected. Disable and re-enable to retry.' : 'Discord Presence is disabled.')
    } }).catch(cause => { if (current) setDiscordStatus('Could not load Discord preferences: ' + String(cause)) })
    return () => { current = false }
  }, [])

  async function handleToggleDiscord(enabled: boolean) {
    if (discordBusy) return
    setDiscordBusy(true)
    try {
      await discord.setRpc(enabled)
      setDiscordEnabled(enabled)
      if (enabled) {
        await discord.updateActivity('Browsing Studio Catalog', 'LAAP Studio', 'logo')
        setDiscordStatus('Discord Rich Presence enabled. Status updated.')
      } else {
        setDiscordStatus('Discord Rich Presence disabled.')
      }
    } catch (e) {
      setDiscordEnabled(false)
      setDiscordStatus('Discord presence failed: '+String(e))
      await discord.setRpc(false).catch(() => {})
    } finally { setDiscordBusy(false) }
  }

  async function handleConnectDiscord() {
    if (!discordClientId.trim() || discordBusy) return
    setDiscordBusy(true)
    try {
      await discord.configure(discordClientId.trim())
      setDiscordEnabled(false)
      setDiscordStatus('Application ID saved. Enable presence to connect to local Discord. No OAuth login is needed for presence.')
    } catch (e) {
      setDiscordStatus('Could not save Discord application ID: ' + String(e))
    } finally { setDiscordBusy(false) }
  }

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
          <div className="customization-card" style={{ marginTop: '1rem', padding: '1rem', borderRadius: '8px' }}>
            <strong>{t('settings.language')}</strong>
            <p className="customization-source">{t('settings.language_desc')}</p>
            {locale !== 'en_US' && <p role="status">Interface translation is partial and has not been professionally reviewed. Untranslated screens still use English. Catalog language is independent.</p>}
            <div style={{ marginTop: '0.5rem' }}>
              <select
                aria-label={t('settings.language')}
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--color-surface, #1e1e2e)', color: 'var(--color-text, #fff)', border: '1px solid var(--color-border, #333)' }}
              >
                {locales.map((loc) => (
                  <option key={loc.code} value={loc.code}>
                    {loc.nativeName} ({loc.name}){loc.coverage === 'partial' ? ' · Partial UI translation' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
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
          <p>Configure optional external integrations and native companions.</p>

          {/* Discord Rich Presence */}
          <div className="customization-card" style={{ marginTop: '1rem', padding: '1rem', borderRadius: '8px' }}>
            <strong>Discord Rich Presence</strong>
            <p className="customization-source">Share your champion select presets and active Studio sessions on Discord.</p>
            <label className="customization-check" style={{ margin: '0.5rem 0' }}>
              <input type="checkbox" checked={discordEnabled} disabled={discordBusy} onChange={(e) => void handleToggleDiscord(e.target.checked)} />
              Enable Discord Presence broadcast
            </label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
              <input aria-label="Discord application ID" disabled={discordBusy} placeholder="Discord Client ID (e.g. 109876543210987654)" value={discordClientId} onChange={(e) => setDiscordClientId(e.target.value)} />
              <button className="btn-secondary" disabled={discordBusy} onClick={() => void handleConnectDiscord()}>Save application ID</button>
            </div>
            {discordStatus && <p role="status">{discordStatus}</p>}
          </div>

          <ProviderSettings />
          <GameAdapterSettingsPanel />

          <div className="customization-card" style={{ marginTop: '1rem', padding: '1rem', borderRadius: '8px' }}>
            <strong>Commercial Entitlements & Licensing</strong>
            <p className="customization-source">Edition: Free Core (Basic is free forever). Paid checkout and commercial activation are GATED pending Riot Developer Portal product review and Merchant of Record onboarding.</p>
          </div>
        </div>}

        {active === 'about' && <AboutSettings currentVersion={update.currentVersion} />}
      </div>
    </div>
  </section>
}
