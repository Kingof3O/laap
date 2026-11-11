import { useState } from 'react'
import { SETTINGS_CATEGORIES, SettingsNavRail, type SettingsCategory } from '../../shared/ui/settings/SettingsNavRail'
import { AppearanceSettings } from '../../shared/ui/settings/AppearanceSettings'
import { UpdatesSettings } from '../../shared/ui/settings/UpdatesSettings'
import { AboutSettings } from '../../shared/ui/settings/AboutSettings'
import { discord, ai } from './api'
import { invokeTauri } from '../../lib/api'
import type { useUpdateChecker } from '../../hooks/useUpdateChecker'

type UpdateController = ReturnType<typeof useUpdateChecker>
const categories = SETTINGS_CATEGORIES.filter((category) => ['general', 'appearance', 'updates', 'advanced', 'about'].includes(category.id))

export function StudioSettings({ update, onOpenRelease, onClose }: {
  update: UpdateController
  onOpenRelease: () => void
  onClose: () => void
}) {
  const [active, setActive] = useState<SettingsCategory>('general')

  // Discord State
  const [discordEnabled, setDiscordEnabled] = useState(false)
  const [discordClientId, setDiscordClientId] = useState('')
  const [discordStatus, setDiscordStatus] = useState('')

  // Stats API State
  const [summonerQuery, setSummonerQuery] = useState('')
  const [summonerRegion, setSummonerRegion] = useState('NA1')
  const [statsResult, setStatsResult] = useState<any>(null)
  const [statsError, setStatsError] = useState('')

  // AI Assistant State
  const [aiPrompt, setAiPrompt] = useState('How do I create a custom chroma texture for Ahri?')
  const [aiAnswer, setAiAnswer] = useState('')
  const [ttsText, setTtsText] = useState('Match starting. Good luck in champion select!')
  const [ttsStatus, setTtsStatus] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleToggleDiscord(enabled: boolean) {
    setDiscordEnabled(enabled)
    try {
      await discord.setRpc(enabled)
      if (enabled) {
        await discord.updateActivity('Browsing Studio Catalog', 'LAAP Studio', 'logo')
        setDiscordStatus('Discord Rich Presence enabled. Status updated.')
      } else {
        setDiscordStatus('Discord Rich Presence disabled.')
      }
    } catch (e) {
      setDiscordStatus('Failed to update Discord presence.')
    }
  }

  async function handleConnectDiscord() {
    if (!discordClientId.trim()) return
    try {
      const url = await discord.openOAuth(discordClientId.trim(), 'http://localhost:1420/oauth/discord')
      setDiscordStatus(`OAuth authorization URL generated: ${url.slice(0, 48)}…`)
    } catch (e) {
      setDiscordStatus('Error initializing Discord OAuth.')
    }
  }

  async function handleLookupStats() {
    if (!summonerQuery.trim()) return
    setStatsError('')
    setStatsResult(null)
    setBusy(true)
    try {
      const res = await invokeTauri('opgg_get_summoner_profile', {
        summonerName: summonerQuery.trim(),
        region: summonerRegion,
      })
      setStatsResult(res)
    } catch (e: any) {
      setStatsError(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleAskAi() {
    if (!aiPrompt.trim()) return
    setBusy(true)
    try {
      const res = await ai.chat(aiPrompt.trim())
      setAiAnswer(res.message)
    } catch (e: any) {
      setAiAnswer('AI assistant request failed: ' + (e?.message || String(e)))
    } finally {
      setBusy(false)
    }
  }

  async function handleSynthesizeTts() {
    if (!ttsText.trim()) return
    setBusy(true)
    try {
      const res = await ai.tts(ttsText.trim())
      setTtsStatus(`TTS synthesized: ${res.format} audio (${res.characterCount} chars).`)
    } catch (e: any) {
      setTtsStatus('TTS generation failed: ' + (e?.message || String(e)))
    } finally {
      setBusy(false)
    }
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
              <input type="checkbox" checked={discordEnabled} onChange={(e) => void handleToggleDiscord(e.target.checked)} />
              Enable Discord Presence broadcast
            </label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
              <input placeholder="Discord Client ID (e.g. 109876543210987654)" value={discordClientId} onChange={(e) => setDiscordClientId(e.target.value)} />
              <button className="btn-secondary" onClick={() => void handleConnectDiscord()}>Authorize</button>
            </div>
            {discordStatus && <p style={{ fontSize: '0.85rem', color: '#10b981', marginTop: '0.5rem' }}>{discordStatus}</p>}
          </div>

          {/* Stats API */}
          <div className="customization-card" style={{ marginTop: '1rem', padding: '1rem', borderRadius: '8px' }}>
            <strong>Authorized Summoner Stats Provider</strong>
            <p className="customization-source">Inspect summoner tier, rank, LP, and queue history via cached provider interface.</p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
              <input style={{ flex: 1 }} placeholder="Summoner Name (e.g. Faker#KR1)" value={summonerQuery} onChange={(e) => setSummonerQuery(e.target.value)} />
              <select style={{ width: '100px' }} value={summonerRegion} onChange={(e) => setSummonerRegion(e.target.value)}>
                <option value="NA1">NA1</option>
                <option value="EUW1">EUW1</option>
                <option value="KR">KR</option>
                <option value="EUN1">EUN1</option>
              </select>
              <button className="btn-secondary" disabled={busy || !summonerQuery.trim()} onClick={() => void handleLookupStats()}>Lookup</button>
            </div>
            {statsError && <p role="alert" style={{ marginTop: '0.5rem' }}>{statsError}</p>}
            {statsResult && (
              <div style={{ marginTop: '0.75rem', padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                <strong>{statsResult.summonerName} ({statsResult.region})</strong> · Level {statsResult.level}
                <div style={{ marginTop: '4px', fontSize: '0.85rem' }}>
                  Solo/Duo: <strong>{statsResult.tier} {statsResult.rank}</strong> ({statsResult.leaguePoints} LP) · {statsResult.wins}W / {statsResult.losses}L ({statsResult.winRate}%)
                </div>
              </div>
            )}
          </div>

          {/* AI & Voice Companion */}
          <div className="customization-card" style={{ marginTop: '1rem', padding: '1rem', borderRadius: '8px' }}>
            <strong>AI Skin Creator Assistant & Voice Companion</strong>
            <p className="customization-source">Authoring assistance for textures, UV maps, and match announcement voice lines.</p>
            <div style={{ marginTop: '0.5rem' }}>
              <label>Creator question <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} /></label>
              <button className="btn-secondary" style={{ marginTop: '4px' }} disabled={busy} onClick={() => void handleAskAi()}>Ask AI Assistant</button>
              {aiAnswer && <p style={{ fontSize: '0.85rem', color: '#93c5fd', marginTop: '0.5rem' }}>{aiAnswer}</p>}
            </div>

            <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem' }}>
              <label>Voice line synthesis (TTS) <input value={ttsText} onChange={(e) => setTtsText(e.target.value)} /></label>
              <button className="btn-secondary" style={{ marginTop: '4px' }} disabled={busy} onClick={() => void handleSynthesizeTts()}>Generate speech</button>
              {ttsStatus && <p style={{ fontSize: '0.85rem', color: '#10b981', marginTop: '0.5rem' }}>{ttsStatus}</p>}
            </div>
          </div>

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
