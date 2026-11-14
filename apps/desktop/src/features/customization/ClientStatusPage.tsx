import { useEffect, useState } from 'react'
import { invokeTauri } from '../../lib/api'
import {
  customizationBootstrap,
  errorMessage,
  gameAdapter,
  inGameRunner,
  skinCatalog,
  type AdapterStatusReport,
  type BootstrapStatus,
  type ChampionSkins,
  type InGameRunnerConfig,
  type InGameRunnerStatus,
} from './api'
import {
  adapterStateBadgeColor,
  describeManagedBootstrap,
  formatAdapterStateLabel,
} from './GameAdapterSettingsPanel'

type Status = { connected: boolean; phase: string | null }

export function ClientStatusPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [consent, setConsent] = useState(true)
  const [autoPoll, setAutoPoll] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [runnerStatus, setRunnerStatus] = useState<InGameRunnerStatus | null>(null)
  const [runnerConfig, setRunnerConfig] = useState<InGameRunnerConfig | null>(null)
  const [adapterStatus, setAdapterStatus] = useState<AdapterStatusReport | null>(null)
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus | null>(null)
  const [provisionBusy, setProvisionBusy] = useState(false)
  const [actionNotice, setActionNotice] = useState('')
  const [monitorBusy, setMonitorBusy] = useState(false)
  const [championSkins, setChampionSkins] = useState<ChampionSkins | null>(null)
  const [skinBusy, setSkinBusy] = useState(false)
  const [selectedSkinId, setSelectedSkinId] = useState<number | null>(null)
  const [skinQuery, setSkinQuery] = useState('')

  async function readClientStatus(currentConsent = consent) {
    if (!currentConsent) return
    setBusy(true)
    setError('')
    try {
      const next = await invokeTauri<Status>('gameflow_status', { consent: currentConsent })
      setStatus(next)
      const polled = await inGameRunner.pollNow(currentConsent)
      setRunnerStatus(polled)
      const probed = await gameAdapter.probe().catch(() => null)
      if (probed) setAdapterStatus(probed)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function refreshRunnerStatus() {
    try {
      const [statusRes, cfgRes, probeRes] = await Promise.allSettled([
        inGameRunner.getStatus(),
        inGameRunner.getConfig(),
        gameAdapter.probe(),
      ])
      if (statusRes.status === 'fulfilled' && statusRes.value) {
        setRunnerStatus(statusRes.value)
      }
      if (cfgRes.status === 'fulfilled' && cfgRes.value) {
        setRunnerConfig(cfgRes.value)
      }
      if (probeRes.status === 'fulfilled' && probeRes.value) {
        setAdapterStatus(probeRes.value)
      }
    } catch {
      // Read-only monitor may be unavailable in non-Studio builds.
    }
  }

  async function toggleAutoApply(nextAutoApply: boolean) {
    const previousCfg = runnerConfig
    const nextCfg: InGameRunnerConfig = {
      monitorEnabled: runnerConfig?.monitorEnabled ?? runnerStatus?.enabled ?? false,
      pollIntervalMs: runnerConfig?.pollIntervalMs ?? 2000,
      autoApplyMods: nextAutoApply,
    }
    setRunnerConfig(nextCfg)
    setMonitorBusy(true)
    setError('')
    setActionNotice('')
    try {
      const saved = await inGameRunner.saveConfig(nextCfg)
      setRunnerConfig(saved)
      setActionNotice(
        nextAutoApply
          ? 'Opt-in ChampSelect auto-apply enabled for matching verified ModLibrary custom mods.'
          : 'ChampSelect automatic adapter activation disabled.',
      )
      await refreshRunnerStatus()
    } catch (cause) {
      setRunnerConfig(previousCfg)
      setError(errorMessage(cause))
    } finally {
      setMonitorBusy(false)
    }
  }

  async function applyMatchedModNow() {
    setMonitorBusy(true)
    setError('')
    setActionNotice('')
    try {
      const rep = await inGameRunner.applyMatchedMod(consent)
      setActionNotice(rep.message)
      await refreshRunnerStatus()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setMonitorBusy(false)
    }
  }

  async function restoreGameDefaultsNow() {
    setMonitorBusy(true)
    setError('')
    setActionNotice('')
    try {
      const rep = await inGameRunner.restoreDefaults()
      setActionNotice(rep.message)
      await refreshRunnerStatus()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setMonitorBusy(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const bs = await customizationBootstrap.status().catch(() => null)
        if (!cancelled && bs) setBootstrapStatus(bs)
      } catch {
        // Ignore when bootstrap command is unmocked.
      }
      try {
        await inGameRunner.setEnabled(true, true).catch(() => null)
      } catch {
        // Ignore best-effort enable failures.
      }
      if (!cancelled) {
        await readClientStatus(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (
      !provisionBusy &&
      bootstrapStatus?.provisionState !== 'downloading' &&
      bootstrapStatus?.provisionState !== 'extracting'
    ) {
      return
    }
    const timer = setInterval(() => {
      void customizationBootstrap
        .status()
        .then((next) => {
          if (next) setBootstrapStatus(next)
          if (next?.managedBackendReady) {
            void readClientStatus(consent)
          }
        })
        .catch(() => {})
    }, 1500)
    return () => clearInterval(timer)
  }, [provisionBusy, bootstrapStatus?.provisionState, consent])

  useEffect(() => {
    const champId = runnerStatus?.detectedChampionId
    setSelectedSkinId(null)
    setSkinQuery('')
    if (!champId) {
      setChampionSkins(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const skins = await skinCatalog.forNumericChampion(champId)
        if (!cancelled) setChampionSkins(skins)
      } catch {
        if (!cancelled) setChampionSkins(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [runnerStatus?.detectedChampionId])

  async function triggerProvisioning() {
    setProvisionBusy(true)
    setError('')
    try {
      const next =
        bootstrapStatus?.actionRequired === 'ltk_host_verification_blocked'
          ? await customizationBootstrap.ensure()
          : await customizationBootstrap.provision(true)
      setBootstrapStatus(next)
      await readClientStatus(consent)
    } catch (cause) {
      setError(errorMessage(cause))
      void customizationBootstrap.status().then((next) => {
        if (next) setBootstrapStatus(next)
      }).catch(() => {})
    } finally {
      setProvisionBusy(false)
    }
  }

  async function selectSkin(skinId: number) {
    const champId = runnerStatus?.detectedChampionId
    if (!champId) return
    setSelectedSkinId(skinId)
    setSkinBusy(true)
    setError('')
    setActionNotice('')
    try {
      const res = await skinCatalog.select(champId, skinId, runnerStatus?.detectedChampionName ?? null)
      const msgParts = [
        res.applyMessage ||
          `Skin ${skinId} selected for ${runnerStatus?.detectedChampionName ?? 'champion'}.`,
        res.lcuSelection
          ? 'LCU selection updated.'
          : res.lcuDetail
            ? `LCU: ${res.lcuDetail}`
            : '',
      ].filter(Boolean)
      setActionNotice(msgParts.join(' '))
      // Nudge runner to re-evaluate/apply with the new selection.
      if (consent) await readClientStatus(true)
      await refreshRunnerStatus()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSkinBusy(false)
    }
  }

  async function exportSelectedSkin(skinId: number) {
    const champId = runnerStatus?.detectedChampionId
    if (!champId || !skinId) return
    setSkinBusy(true)
    setError('')
    setActionNotice('')
    try {
      const exported = await skinCatalog.exportOverlay(
        champId,
        skinId,
        runnerStatus?.detectedChampionName ?? null,
        true,
      )
      const kb = Math.max(1, Math.round(exported.sizeBytes / 1024))
      setActionNotice(
        `Exported ${exported.fileName} (${kb} KB) to ${exported.path}. You can import it manually inside standalone LTK Manager (official skins may still trigger LTK Manager WAD checks).`,
      )
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSkinBusy(false)
    }
  }

  useEffect(() => {
    if (!consent || !autoPoll) return
    const timer = setInterval(() => {
      void readClientStatus(true)
    }, 2000)
    return () => clearInterval(timer)
  }, [consent, autoPoll])

  async function handleConsentChange(checked: boolean) {
    setConsent(checked)
    setError('')
    if (!checked) {
      setAutoPoll(false)
      setStatus(null)
      if (runnerStatus?.enabled) {
        try {
          await inGameRunner.setEnabled(false, false)
        } catch {
          // Ignore teardown error on opt-out.
        }
      }
      await refreshRunnerStatus()
    }
  }

  async function toggleBackgroundMonitor(enable: boolean) {
    setMonitorBusy(true)
    setError('')
    try {
      await inGameRunner.setEnabled(enable, consent)
      if (enable && consent) {
        await readClientStatus(true)
      } else {
        await refreshRunnerStatus()
      }
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setMonitorBusy(false)
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

  const matchedLoadout = runnerStatus?.resolvedLoadout

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <h2>League client status</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Read-only League client connection, gameflow phase, and Champion Select reference lookup. Local client credentials stay in native memory.
      </p>

      <p className="customization-source" style={{ marginBottom: '1.25rem' }}>
        Custom mod activation is user-configured and user-accepted risk. LAAP itself does not implement memory hooking, DLL injection, or Vanguard bypass; apply/restore is delegated to the external adapter you configure.
      </p>

      <div className="customization-filters" style={{ marginBottom: '1rem' }}>
        <label className="customization-check">
          <input
            type="checkbox"
            checked={consent}
            disabled={busy || monitorBusy}
            onChange={(event) => void handleConsentChange(event.target.checked)}
          />
          {' '}Allow read-only access to my running League client.
        </label>

        {consent && (
          <label className="customization-check">
            <input
              type="checkbox"
              checked={autoPoll}
              disabled={busy}
              onChange={(event) => setAutoPoll(event.target.checked)}
            />
            {' '}Auto-poll every 2s
          </label>
        )}
      </div>

      <div className="customization-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <button
          className="btn-primary"
          disabled={!consent || busy}
          onClick={() => void readClientStatus(consent)}
        >
          {busy ? 'Checking client…' : 'Read client status'}
        </button>

        {(consent || runnerStatus?.enabled) && (
          <button
            type="button"
            className="btn-secondary"
            disabled={monitorBusy || (!consent && !runnerStatus?.enabled)}
            onClick={() => void toggleBackgroundMonitor(!(runnerStatus?.enabled ?? false))}
          >
            {runnerStatus?.enabled ? 'Stop background observer' : 'Start background observer'}
          </button>
        )}
      </div>

      {bootstrapStatus && (
        <div
          data-testid="client-bootstrap-status"
          className="customization-card"
          style={{
            padding: '0.85rem 1.1rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            border: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            fontSize: '0.85rem',
          }}
        >
          {(() => {
            const summary = describeManagedBootstrap(bootstrapStatus)
            return (
              <>
                <div>
                  <div>
                    <strong>Managed Patcher{bootstrapStatus.backendKind === 'ltk-patcher' ? ' (LTK)' : ''}:</strong>{' '}
                    <span
                      style={{
                        color: summary.color,
                        fontWeight: 600,
                      }}
                    >
                      {summary.label}
                    </span>
                    {' | '}
                    <strong>Pengu Companion:</strong>{' '}
                    <span style={{ color: bootstrapStatus.penguPluginInstalled ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                      {bootstrapStatus.penguPluginInstalled
                        ? 'Installed'
                        : bootstrapStatus.penguDetected
                          ? 'Pengu Detected (Pending)'
                          : 'Not Detected'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    {bootstrapStatus.provisionDetail || bootstrapStatus.detail}
                  </div>
                </div>
                {summary.isActionable && (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={
                      provisionBusy ||
                      bootstrapStatus.provisionState === 'downloading' ||
                      bootstrapStatus.provisionState === 'extracting'
                    }
                    onClick={() => void triggerProvisioning()}
                  >
                    {provisionBusy ? 'Working…' : summary.buttonLabel}
                  </button>
                )}
              </>
            )
          })()}
        </div>
      )}

      {error && <p role="alert" style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</p>}

      {(status || runnerStatus?.enabled) && (
        <div
          className="customization-card"
          style={{
            padding: '1.25rem 1.5rem',
            borderRadius: '10px',
            marginBottom: '1.5rem',
            border: '1px solid var(--border-color)',
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.05rem' }}>
            Read-only client &amp; gameflow observation
          </h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '12px',
            }}
          >
            <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>League Client</div>
              <div style={{ fontWeight: 600, marginTop: '2px', color: (status?.connected || runnerStatus?.clientConnected) ? '#10b981' : '#f59e0b' }}>
                {(status?.connected || runnerStatus?.clientConnected) ? '● Running & Connected' : '○ Not Detected'}
              </div>
            </div>

            <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Gameflow Phase</div>
              <div style={{ fontWeight: 600, marginTop: '2px', color: 'var(--color-accent-400)' }}>
                {status?.phase ?? runnerStatus?.gameflowPhase ?? 'None / Offline'}
              </div>
            </div>

            <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Selected Champion</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>
                {runnerStatus?.detectedChampionName
                  ? `${runnerStatus.detectedChampionName} (ID: ${runnerStatus.detectedChampionId})`
                  : 'None detected'}
              </div>
            </div>

            <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Saved Reference</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>
                {matchedLoadout
                  ? `${matchedLoadout.skinOrModName} (${matchedLoadout.source})`
                  : 'None'}
              </div>
              {matchedLoadout && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {matchedLoadout.limitation}
                </div>
              )}
            </div>

            <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>In-Game Adapter</div>
              {(() => {
                const effectiveState =
                  runnerStatus?.adapterState ??
                  adapterStatus?.state ??
                  (runnerStatus?.adapterAvailable ? 'compatible' : 'unavailable')
                const isBlockedOrFailed =
                  effectiveState === 'blockedByPolicy' ||
                  effectiveState === 'needsUpdate' ||
                  effectiveState === 'failed' ||
                  effectiveState === 'unsupportedGameBuild' ||
                  effectiveState === 'unsupportedPlatform' ||
                  effectiveState === 'notInstalled' ||
                  effectiveState === 'unavailable'
                const isReady =
                  !isBlockedOrFailed &&
                  (Boolean(runnerStatus?.adapterAvailable) ||
                    Boolean(adapterStatus?.compatible) ||
                    effectiveState === 'applied' ||
                    effectiveState === 'compatible')
                const adapterDetail = runnerStatus?.adapterStatus ?? adapterStatus?.detail
                return (
                  <>
                    <div
                      data-testid="client-adapter-status-label"
                      style={{
                        fontWeight: 600,
                        marginTop: '2px',
                        color: adapterStateBadgeColor(effectiveState),
                      }}
                    >
                      {isReady ? '●' : '○'} {formatAdapterStateLabel(effectiveState, adapterDetail)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {adapterDetail ??
                        'Configure an external mod loader adapter in Settings → Advanced to apply custom .fantome / .modpkg mods.'}
                    </div>
                    {(runnerStatus?.adapterVersion || adapterStatus?.version || runnerStatus?.detectedGameBuild || adapterStatus?.leagueInstall?.detectedBuild) && (
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Adapter: {runnerStatus?.adapterVersion ?? adapterStatus?.version ?? '—'} · League Build:{' '}
                        {runnerStatus?.detectedGameBuild ?? adapterStatus?.leagueInstall?.detectedBuild ?? 'Unknown'}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Match Apply Status</div>
              <div
                data-testid="client-match-apply-status"
                style={{
                  fontWeight: 600,
                  marginTop: '2px',
                  overflowWrap: 'anywhere',
                  color: runnerStatus?.matchApplyStatus?.startsWith('failed')
                    ? '#ef4444'
                    : runnerStatus?.matchApplyStatus === 'injected' ||
                        runnerStatus?.matchApplyStatus === 'applied'
                      ? '#10b981'
                      : runnerStatus?.matchApplyStatus === 'waiting-for-game' ||
                          runnerStatus?.matchApplyStatus === 'injecting'
                        ? '#38bdf8'
                        : undefined,
                }}
              >
                {runnerStatus?.matchApplyStatus ?? (matchedLoadout?.appliedInGame ? 'applied' : 'idle')}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {runnerStatus?.activeAppliedModHash
                  ? `Active mod hash: ${runnerStatus.activeAppliedModHash.slice(0, 12)}…`
                  : 'No active custom mod overlay applied.'}
              </div>
            </div>
          </div>

          {runnerStatus?.detectedChampionId ? (
            <div
              style={{
                marginTop: '1rem',
                paddingTop: '0.85rem',
                borderTop: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {(() => {
                const matchedSkin = championSkins?.skins.find(
                  (s) => matchedLoadout?.source === 'SkinSelection' && matchedLoadout.skinOrModName === s.name,
                )
                const exportSkinId =
                  selectedSkinId ??
                  (matchedSkin
                    ? Number(matchedSkin.id) ||
                      Number(runnerStatus.detectedChampionId || 0) * 1000 + Number(matchedSkin.num || 0)
                    : null)
                const selectedOption = championSkins?.skins.find(
                  (s) =>
                    (Number(s.id) || Number(runnerStatus.detectedChampionId || 0) * 1000 + Number(s.num || 0)) ===
                    exportSkinId,
                )
                const exportIsBase = selectedOption
                  ? selectedOption.isBase
                  : exportSkinId != null && exportSkinId % 1000 === 0
                return (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '8px',
                      marginBottom: '8px',
                    }}
                  >
                    <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                      All skins for {runnerStatus.detectedChampionName ?? `Champion ${runnerStatus.detectedChampionId}`}
                    </h4>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={skinBusy || !exportSkinId || exportIsBase}
                      onClick={() => exportSkinId && void exportSelectedSkin(exportSkinId)}
                      title={
                        !exportSkinId || exportIsBase
                          ? 'Select any non-default skin below to export its .fantome overlay'
                          : 'Export generated .fantome overlay package to LAAP exports folder'
                      }
                    >
                      Export .fantome
                    </button>
                  </div>
                )
              })()}
              <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Select any skin (including unowned). Selection is saved locally, sent best-effort to Champ Select, and prepared into an overlay for the managed patcher backend (or exported as .fantome for manual use in standalone LTK Manager).
              </p>
              {!championSkins || championSkins.skins.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Fetching champion skins from Data Dragon…
                </p>
              ) : (
                <>
                  <input
                    type="search"
                    aria-label="Filter champion skins"
                    placeholder="Filter skins…"
                    value={skinQuery}
                    onChange={(e) => setSkinQuery(e.target.value)}
                    style={{
                      width: '100%',
                      maxWidth: '280px',
                      marginBottom: '10px',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      fontSize: '0.84rem',
                    }}
                  />
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                      gap: '8px',
                      maxHeight: '320px',
                      overflowY: 'auto',
                      paddingRight: '4px',
                    }}
                  >
                    {championSkins.skins
                      .filter((skin) =>
                        skin.name.toLowerCase().includes(skinQuery.trim().toLowerCase()),
                      )
                      .map((skin) => {
                        const fullId = Number(skin.id) || (Number(runnerStatus.detectedChampionId || 0) * 1000 + Number(skin.num || 0))
                        const isSelected =
                          selectedSkinId === fullId ||
                          (selectedSkinId === null &&
                            matchedLoadout?.source === 'SkinSelection' &&
                            matchedLoadout.skinOrModName === skin.name)
                        return (
                          <button
                            key={skin.id}
                            type="button"
                            className="btn-secondary"
                            aria-pressed={isSelected}
                            disabled={skinBusy || !runnerStatus.detectedChampionId}
                            onClick={() => void selectSkin(fullId)}
                            style={{
                              textAlign: 'left',
                              padding: '8px 10px',
                              fontSize: '0.82rem',
                              whiteSpace: 'normal',
                              border: isSelected
                                ? '1px solid var(--color-accent-400, #38bdf8)'
                                : undefined,
                              background: isSelected
                                ? 'rgba(56, 189, 248, 0.16)'
                                : undefined,
                            }}
                            title={skin.chromas ? 'Has chromas' : undefined}
                          >
                            {skin.isBase ? 'Default: ' : ''}{skin.name}
                            {skin.chromas ? ' • chromas' : ''}
                          </button>
                        )
                      })}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {/* Explicit Opt-In Adapter Activation Controls */}
          <div
            style={{
              marginTop: '1rem',
              paddingTop: '0.85rem',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <label className="customization-check" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={Boolean(runnerConfig?.autoApplyMods ?? runnerStatus?.autoApplyMods)}
                disabled={
                  monitorBusy ||
                  !(runnerStatus?.consentGranted ?? (adapterStatus?.consentGranted && adapterStatus?.clearanceAcknowledged))
                }
                onChange={(e) => void toggleAutoApply(e.target.checked)}
              />
              <span>
                Opt-in: auto-apply matching custom <code>.fantome</code> / <code>.modpkg</code> ModLibrary entry in ChampSelect (auto-restores in Lobby / EndOfGame)
              </span>
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                disabled={
                  monitorBusy ||
                  !consent ||
                  !(
                    matchedLoadout?.source === 'ModLibrary' ||
                    matchedLoadout?.source === 'SkinSelection' ||
                    (matchedLoadout?.source === 'Preset' && Boolean(matchedLoadout?.modHash))
                  ) ||
                  !(runnerStatus?.adapterAvailable ?? adapterStatus?.compatible)
                }
                onClick={() => void applyMatchedModNow()}
              >
                Apply Matched Mod
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={monitorBusy || !(adapterStatus?.compatible || runnerStatus?.adapterAvailable || runnerStatus?.activeAppliedModHash)}
                onClick={() => void restoreGameDefaultsNow()}
              >
                Stop &amp; Restore Defaults
              </button>
            </div>
          </div>

          {actionNotice && (
            <p role="status" style={{ color: '#10b981', marginTop: '0.75rem', marginBottom: 0 }}>
              {actionNotice}
            </p>
          )}

          {(status?.phase ?? runnerStatus?.gameflowPhase) === 'ChampSelect' && (
            <p role="status" style={{ marginTop: '1rem', marginBottom: 0 }}>
              {matchedLoadout?.source === 'ModLibrary' ||
              matchedLoadout?.source === 'SkinSelection' ||
              (matchedLoadout?.source === 'Preset' && matchedLoadout?.modHash) ? (
                matchedLoadout.appliedInGame
                  ? `Champion select active — '${matchedLoadout.skinOrModName}' activated via the configured external adapter.`
                  : `Champion select active — matched '${matchedLoadout.skinOrModName}'. Use Opt-In Auto-Apply or 'Apply Matched Mod'.`
              ) : (
                'Champion select is active. This preset has no mapped mod package, so only reference metadata is available.'
              )}
            </p>
          )}
          {(status?.phase ?? runnerStatus?.gameflowPhase) === 'InProgress' && (
            <p role="status" style={{ marginTop: '1rem', marginBottom: 0 }}>
              Active match in progress. Adapter activation/restore is deferred until Lobby or EndOfGame to avoid modifying live match files.
            </p>
          )}
          {(status?.phase ?? runnerStatus?.gameflowPhase) === 'ReadyCheck' && (
            <p role="status" style={{ marginTop: '1rem', marginBottom: 0 }}>
              A match is ready. Respond in the official League client.
            </p>
          )}
        </div>
      )}

      <div
        className="customization-card"
        style={{
          padding: '1rem 1.25rem',
          borderRadius: '8px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Read-Only Observation Log</h4>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '2px 8px', fontSize: '0.75rem' }}
            onClick={() => void clearLogs()}
          >
            Clear Log
          </button>
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
              <div key={idx} style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  [{new Date(evt.timestamp).toLocaleTimeString()}]
                </span>
                <span
                  style={{
                    color:
                      evt.eventType.includes('FAILED') || evt.eventType.includes('ERROR')
                        ? '#ef4444'
                        : evt.eventType.includes('INJECTED') ||
                            evt.eventType.includes('REDIRECTED') ||
                            evt.eventType.includes('APPLIED')
                          ? '#10b981'
                          : '#38bdf8',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {evt.eventType}:
                </span>
                <span style={{ color: 'var(--text-primary)', minWidth: 0, overflowWrap: 'anywhere' }}>
                  {evt.message}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            No events recorded yet. Grant read-only permission above to inspect your running League client.
          </p>
        )}
      </div>
    </div>
  )
}
