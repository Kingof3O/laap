import { useCallback, useEffect, useState } from 'react'
import {
  customizationBootstrap,
  customizationDiagnostics,
  gameAdapter,
  gamePath,
  type AdapterLifecycleState,
  type AdapterStatusReport,
  type BootstrapStatus,
  type GameAdapterConfig,
  type GameInstallInfo,
  type SelfTestStep,
} from './api'

export function formatAdapterStateLabel(state?: AdapterLifecycleState): string {
  switch (state) {
    case 'compatible':
      return 'Compatible'
    case 'applied':
      return 'Applied in Game'
    case 'available':
      return 'Available'
    case 'detected':
      return 'Detected'
    case 'inspected':
      return 'Inspected'
    case 'deferred':
      return 'Deferred (Match Active)'
    case 'busy':
      return 'Busy'
    case 'stopping':
      return 'Stopping'
    case 'unsupportedGameBuild':
      return 'Unsupported Game Build'
    case 'unsupportedPlatform':
      return 'Unsupported Platform (Windows Only)'
    case 'needsUpdate':
      return 'Needs Adapter Update'
    case 'blockedByPolicy':
      return 'Opt-in / Policy Confirmation Required'
    case 'failed':
      return 'Verification Failed'
    case 'notInstalled':
      return 'Not Installed'
    default:
      return 'Unavailable'
  }
}

export function adapterStateBadgeColor(state?: AdapterLifecycleState): string {
  switch (state) {
    case 'compatible':
    case 'applied':
    case 'available':
      return '#16a34a'
    case 'deferred':
    case 'busy':
    case 'detected':
    case 'inspected':
    case 'stopping':
      return '#d97706'
    case 'blockedByPolicy':
    case 'unsupportedGameBuild':
    case 'needsUpdate':
    case 'failed':
      return '#dc2626'
    default:
      return '#6b7280'
  }
}

export function GameAdapterSettingsPanel() {
  const [config, setConfig] = useState<GameAdapterConfig>({
    adapterPath: null,
    expectedSha256: null,
    userConsentGranted: false,
    clearanceAcknowledged: false,
    autoApplyInChampSelect: false,
  })
  const [installInfo, setInstallInfo] = useState<GameInstallInfo | null>(null)
  const [customLeagueInput, setCustomLeagueInput] = useState('')
  const [statusReport, setStatusReport] = useState<AdapterStatusReport | null>(null)
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus | null>(null)
  const [provisionBusy, setProvisionBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selfTest, setSelfTest] = useState<SelfTestStep[] | null>(null)

  const refreshAll = useCallback(async (runLiveProbe = true) => {
    try {
      const [cfgRes, instRes, bootRes] = await Promise.allSettled([
        gameAdapter.getConfig(),
        gamePath.getInstallInfo(),
        customizationBootstrap.status(),
      ])
      if (cfgRes.status === 'fulfilled' && cfgRes.value) {
        setConfig(cfgRes.value)
      }
      if (bootRes.status === 'fulfilled' && bootRes.value) {
        setBootstrapStatus(bootRes.value)
      }
      if (instRes.status === 'fulfilled' && instRes.value) {
        setInstallInfo(instRes.value)
        if (instRes.value.leaguePath) {
          setCustomLeagueInput(instRes.value.leaguePath)
        }
      }
      if (runLiveProbe) {
        const probeRes = await gameAdapter.probe().catch(() => null)
        if (probeRes) {
          setStatusReport(probeRes)
          setInstallInfo(probeRes.leagueInstall)
          if (probeRes.leagueInstall.leaguePath) {
            setCustomLeagueInput(probeRes.leagueInstall.leaguePath)
          }
        }
      }
    } catch {
      // Keep UI resilient when external commands are unavailable or unmocked.
    }
  }, [])

  useEffect(() => {
    void refreshAll(true)
  }, [refreshAll])

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
            void refreshAll(true)
          }
        })
        .catch(() => {})
    }, 1500)
    return () => clearInterval(timer)
  }, [provisionBusy, bootstrapStatus?.provisionState, refreshAll])

  async function saveAdapterConfig(next: GameAdapterConfig, successMsg?: string) {
    const previous = config
    setConfig(next)
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const saved = await gameAdapter.saveConfig(next)
      setConfig(saved)
      const probed = await gameAdapter.probe().catch(() => null)
      if (probed) {
        setStatusReport(probed)
      }
      setNotice(successMsg ?? 'Saved external adapter configuration.')
    } catch (e) {
      setConfig(previous)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleBrowseAdapter() {
    setError(null)
    try {
      const picked = await gameAdapter.pickExecutable()
      if (picked) {
        await saveAdapterConfig(
          { ...config, adapterPath: picked },
          `Selected external adapter: ${picked}`,
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleBrowseLeaguePath() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const picked = await gamePath.pick()
      if (picked) {
        setCustomLeagueInput(picked)
        await refreshAll(true)
        setNotice(`Validated League installation folder: ${picked}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleApplyLeaguePath() {
    if (!customLeagueInput.trim()) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const saved = await gamePath.set(customLeagueInput.trim())
      setCustomLeagueInput(saved)
      await refreshAll(true)
      setNotice(`Saved validated League installation folder: ${saved}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleAutoDetectLeaguePath() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const info = await gamePath.clear()
      setInstallInfo(info)
      setCustomLeagueInput(info.leaguePath ?? '')
      await refreshAll(true)
      setNotice(
        info.leaguePath
          ? `Detected League folder: ${info.leaguePath}`
          : 'Cleared custom League path; auto-detection found no installation.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleVerifyProbe() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const saved = await gameAdapter.saveConfig(config)
      setConfig(saved)
      const probe = await gameAdapter.probe()
      setStatusReport(probe)
      setInstallInfo(probe.leagueInstall)
      setNotice(probe.detail)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleRestoreDefaults() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const outcome = await gameAdapter.restoreDefaults()
      setNotice(outcome.message)
      await refreshAll(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleProvisionManaged() {
    setProvisionBusy(true)
    setError(null)
    setNotice(null)
    try {
      const next = await customizationBootstrap.provision(true)
      setBootstrapStatus(next)
      setNotice(next.provisionDetail || next.detail)
      await refreshAll(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      void customizationBootstrap.status().then((next) => {
        if (next) setBootstrapStatus(next)
      }).catch(() => {})
    } finally {
      setProvisionBusy(false)
    }
  }

  const badgeColor = adapterStateBadgeColor(statusReport?.state)

  return (
    <div className="customization-card" style={{ marginTop: '1rem', padding: '1rem', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <strong>External Custom Mod Loader Adapter (CLI)</strong>
          <p className="customization-source" style={{ marginTop: '4px', marginBottom: 0 }}>
            User-installed external CLI integration (Windows). Can activate local custom mod packages via the configured adapter. Use at your own risk; you are responsible for compliance with game/platform policies.
          </p>
        </div>
        <span
          data-testid="studio-adapter-state-badge"
          style={{
            padding: '4px 10px',
            borderRadius: '999px',
            fontSize: '0.8rem',
            fontWeight: 600,
            color: '#fff',
            background: badgeColor,
          }}
        >
          {formatAdapterStateLabel(statusReport?.state)}
        </span>
      </div>

      {/* League Installation Path & Build */}
      <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', marginBottom: '6px' }}>
          Validated League of Legends Installation Folder
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="text"
            aria-label="League of Legends installation folder"
            value={customLeagueInput}
            onChange={(e) => setCustomLeagueInput(e.target.value)}
            placeholder="C:\Riot Games\League of Legends"
            style={{ flex: '1 1 260px', padding: '6px 10px', borderRadius: '6px' }}
          />
          <button type="button" disabled={busy} onClick={handleApplyLeaguePath}>
            Save Path
          </button>
          <button type="button" disabled={busy} onClick={handleBrowseLeaguePath}>
            Browse...
          </button>
          <button type="button" disabled={busy} onClick={handleAutoDetectLeaguePath}>
            Auto-Detect
          </button>
        </div>
        <div className="customization-source" style={{ marginTop: '6px', fontSize: '0.82rem' }}>
          Detected Game Build:{' '}
          <strong data-testid="studio-league-build">
            {installInfo?.detectedBuild ?? 'Unknown'}
          </strong>
          {installInfo?.source ? ` (${installInfo.source})` : ''}
          {installInfo?.validationError && !installInfo.isDetected
            ? ` — ${installInfo.validationError}`
            : ''}
        </div>
      </div>

      {/* External Adapter CLI Binary Path & SHA-256 Provenance */}
      <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', marginBottom: '6px' }}>
          User-Installed External Adapter Executable
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="text"
            aria-label="External adapter executable path"
            value={config.adapterPath ?? ''}
            onChange={(e) => setConfig((c) => ({ ...c, adapterPath: e.target.value || null }))}
            placeholder="C:\Tools\league-mod-adapter.exe"
            style={{ flex: '1 1 260px', padding: '6px 10px', borderRadius: '6px' }}
          />
          <button type="button" disabled={busy} onClick={handleBrowseAdapter}>
            Browse Executable...
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => saveAdapterConfig({ ...config, adapterPath: null }, 'Cleared configured adapter path.')}
          >
            Clear
          </button>
        </div>

        <div style={{ marginTop: '10px' }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.84rem', marginBottom: '4px' }}>
            Pinned Binary SHA-256 Provenance (optional)
          </label>
          <input
            type="text"
            aria-label="Pinned adapter SHA-256"
            value={config.expectedSha256 ?? ''}
            onChange={(e) => setConfig((c) => ({ ...c, expectedSha256: e.target.value.trim() || null }))}
            placeholder="Optional 64-char hex SHA-256 to pin adapter executable"
            style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.82rem' }}
          />
          {statusReport?.binarySha256 && (
            <div className="customization-source" style={{ marginTop: '4px', fontSize: '0.78rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              Detected SHA-256: {statusReport.binarySha256}
              <button
                type="button"
                disabled={busy}
                style={{ marginLeft: '8px', fontSize: '0.75rem' }}
                onClick={() =>
                  setConfig((c) => ({ ...c, expectedSha256: statusReport.binarySha256 }))
                }
              >
                Pin Detected Hash
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Managed Patcher Backend (mod-tools) Status */}
      <div
        data-testid="studio-managed-backend-card"
        style={{
          marginTop: '12px',
          padding: '10px',
          borderRadius: '6px',
          background: 'rgba(255,255,255,0.04)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          fontSize: '0.84rem',
        }}
      >
        <div>
          <strong>
            Managed Patcher (
            <code>
              {bootstrapStatus?.backendKind === 'ltk-patcher'
                ? 'ltk-patcher'
                : 'LTK Patcher / mod-tools'}
            </code>
            ):
          </strong>{' '}
          {bootstrapStatus ? (
            <>
              <span
                style={{
                  color: bootstrapStatus.managedBackendReady
                    ? '#22c55e'
                    : bootstrapStatus.provisionState === 'failed' ||
                        bootstrapStatus.provisionState === 'error'
                      ? '#ef4444'
                      : '#f59e0b',
                  fontWeight: 600,
                }}
              >
                {bootstrapStatus.managedBackendReady
                  ? 'Ready'
                  : bootstrapStatus.provisionState === 'downloading'
                    ? `Downloading${bootstrapStatus.provisionProgressPct != null ? ` (${bootstrapStatus.provisionProgressPct}%)` : '…'}`
                    : bootstrapStatus.provisionState === 'extracting'
                      ? 'Extracting…'
                      : bootstrapStatus.actionRequired === 'elevation_mismatch'
                        ? 'Admin Mismatch Detected'
                        : bootstrapStatus.actionRequired === 'sync_ltk_dll'
                          ? 'LTK Sync Needed'
                          : bootstrapStatus.actionRequired === 'install_ltk_manager' ||
                              bootstrapStatus.actionRequired === 'confirm_uac'
                            ? 'LTK Setup Required'
                            : bootstrapStatus.provisionState === 'failed' ||
                                bootstrapStatus.provisionState === 'error'
                              ? 'Provisioning Failed'
                              : 'Setup Needed'}
              </span>
              <div className="customization-source" style={{ marginTop: '3px' }}>
                {bootstrapStatus.provisionDetail || bootstrapStatus.detail}
              </div>
            </>
          ) : (
            <span className="customization-source">Managed provisioning status unavailable.</span>
          )}
        </div>
        <button
          type="button"
          disabled={
            busy ||
            provisionBusy ||
            bootstrapStatus?.provisionState === 'downloading' ||
            bootstrapStatus?.provisionState === 'extracting'
          }
          onClick={handleProvisionManaged}
        >
          {provisionBusy
            ? 'Working…'
            : bootstrapStatus?.actionRequired === 'install_ltk_manager' ||
                bootstrapStatus?.actionRequired === 'confirm_uac'
              ? 'Install LTK Patcher'
              : bootstrapStatus?.actionRequired === 'sync_ltk_dll'
                ? 'Sync LTK Patcher'
                : bootstrapStatus?.actionRequired === 'elevation_mismatch'
                  ? 'Re-check Elevation'
                  : 'Provision Managed Backend'}
        </button>
      </div>

      {/* Verification Status Summary */}
      {statusReport && (
        <div
          data-testid="studio-adapter-verification-summary"
          style={{
            marginTop: '12px',
            padding: '10px',
            borderRadius: '6px',
            background: 'rgba(255,255,255,0.04)',
            fontSize: '0.84rem',
          }}
        >
          <div>
            <strong>Backend:</strong> {statusReport.backend ?? 'external'}
            {' '}| <strong>Capabilities:</strong>{' '}
            {statusReport.capabilities?.length
              ? statusReport.capabilities.join(', ')
              : '—'}
          </div>
          <div>
            <strong>Version:</strong> {statusReport.version ?? '—'}{' '}
            | <strong>Supported Builds:</strong>{' '}
            {statusReport.supportedGameBuilds?.length
              ? statusReport.supportedGameBuilds.join(', ')
              : '—'}{' '}
            | <strong>Formats:</strong>{' '}
            {statusReport.supportedFormats?.length
              ? statusReport.supportedFormats.join(', ')
              : '—'}
            {statusReport.discoverySource ? (
              <>
                {' '}
                | <strong>Source:</strong> {statusReport.discoverySource}
              </>
            ) : null}
          </div>
          <div className="customization-source" style={{ marginTop: '4px' }}>
            {statusReport.detail}
          </div>
        </div>
      )}

      {/* Explicit Consent & Clearance Controls */}
      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.88rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={config.userConsentGranted}
            onChange={(e) =>
              saveAdapterConfig({ ...config, userConsentGranted: e.target.checked })
            }
          />
          <span>
            Enable external custom mod adapter integration (applies verified local custom mods outside active matches)
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={config.clearanceAcknowledged}
            onChange={(e) =>
              saveAdapterConfig({ ...config, clearanceAcknowledged: e.target.checked })
            }
          />
          <span>
            I confirm I sourced this external adapter binary independently and accept Riot / Vanguard compliance responsibility
          </span>
        </label>
      </div>

      {/* Actions */}
      <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={handleVerifyProbe}>
          {busy ? 'Verifying...' : 'Save & Verify Adapter'}
        </button>
        <button type="button" disabled={busy} onClick={handleRestoreDefaults}>
          Stop & Restore Defaults
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              setSelfTest(await customizationDiagnostics.selfTest())
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            } finally {
              setBusy(false)
            }
          }}
        >
          Run Adapter Self-Test
        </button>
      </div>

      {selfTest && (
        <div data-testid="studio-adapter-self-test" style={{ marginTop: '10px', fontSize: '0.82rem' }}>
          {selfTest.map((step) => (
            <div key={step.name} style={{ color: step.ok ? '#22c55e' : '#ef4444' }}>
              {step.ok ? '✓' : '✗'} {step.name}: {step.detail}
            </div>
          ))}
        </div>
      )}

      {notice && (
        <div
          data-testid="studio-adapter-notice"
          style={{ marginTop: '10px', fontSize: '0.84rem', color: '#22c55e' }}
        >
          {notice}
        </div>
      )}
      {error && (
        <div
          data-testid="studio-adapter-error"
          style={{ marginTop: '10px', fontSize: '0.84rem', color: '#ef4444' }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
