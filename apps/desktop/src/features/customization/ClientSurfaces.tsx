import { useEffect, useState } from 'react'
import {
  clientBridge,
  clientSurfaces,
  errorMessage,
  type ClientBridgeStatus,
  type ClientSurfacesConfig,
  type SurfaceConfig,
} from './api'

export function ClientSurfaces() {
  const [config, setConfig] = useState<ClientSurfacesConfig | null>(null)
  const [adapterStatus, setAdapterStatus] = useState<{
    isAvailable: boolean
    adapterType: string
    activeSurfacesCount: number
    message: string
  } | null>(null)
  const [bridge, setBridge] = useState<ClientBridgeStatus | null>(null)
  const [pluginsDirDraft, setPluginsDirDraft] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [copiedSnippet, setCopiedSnippet] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function refreshBridgeAndAdapter() {
    const [adapter, bridgeState] = await Promise.all([
      clientSurfaces.getAdapterStatus().catch(() => null),
      clientBridge.getStatus().catch(() => null),
    ])
    if (adapter) setAdapterStatus(adapter)
    if (bridgeState) {
      setBridge(bridgeState)
      setPluginsDirDraft(bridgeState.customPluginsDir ?? bridgeState.pengu.effectivePluginsDir ?? '')
    }
  }

  async function load() {
    setBusy(true)
    setError('')
    try {
      const [cfg, adapter, bridgeState] = await Promise.all([
        clientSurfaces.getConfig(),
        clientSurfaces.getAdapterStatus(),
        clientBridge.getStatus().catch(() => null),
      ])
      setConfig(cfg)
      setAdapterStatus(adapter)
      if (bridgeState) {
        setBridge(bridgeState)
        setPluginsDirDraft(bridgeState.customPluginsDir ?? bridgeState.pengu.effectivePluginsDir ?? '')
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function updateSurface(id: string, patch: Partial<SurfaceConfig>) {
    if (!config) return
    setConfig({
      ...config,
      surfaces: config.surfaces.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })
  }

  async function handleSave() {
    if (!config) return
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await clientSurfaces.saveConfig(config)
      await refreshBridgeAndAdapter()
      setStatus('Client surfaces configuration saved.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleReset() {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const def = await clientSurfaces.resetDefaults()
      setConfig(def)
      await refreshBridgeAndAdapter()
      setStatus('Reset all 16 client surfaces to factory defaults.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleExportSnippet() {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      if (config) await clientSurfaces.saveConfig(config)
      const css = await clientSurfaces.exportSnippet()
      // Copy to clipboard
      let copied = false
      try { await navigator.clipboard.writeText(css); copied = true } catch { /* Download remains available without clipboard permission. */ }
      setCopiedSnippet(copied)
      setTimeout(() => setCopiedSnippet(false), 3000)

      // Also trigger a file download
      const blob = new Blob([css], { type: 'text/css' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'laap-client-surfaces.css'
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)

      setStatus(copied ? 'Saved configuration; CSS copied and download requested.' : 'Saved configuration; CSS download requested. Clipboard permission was unavailable.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function importConfiguration(file: File) {
    setBusy(true); setError(''); setStatus('')
    try {
      if (file.size > 1024 * 1024) throw Error('Surface configurations are limited to 1 MiB.')
      const imported: ClientSurfacesConfig = JSON.parse(await file.text())
      await clientSurfaces.validate(imported)
      setConfig(imported)
      setStatus('Validated configuration loaded for review. Save Configuration to persist it; no League-client changes are applied.')
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function exportConfiguration() {
    if (!config) return
    setBusy(true); setError('')
    try {
      await clientSurfaces.validate(config)
      const url = URL.createObjectURL(new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a'); link.href = url; link.download = 'laap-client-surfaces.json'; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 10000)
      setStatus('Validated configuration download requested. Import restores editable definitions, not a League-client integration.')
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  async function handleToggleConsent(granted: boolean) {
    const previous = bridge?.pluginConsentGranted ?? false
    setBridge((prev) => (prev ? { ...prev, pluginConsentGranted: granted } : prev))
    const ok = await runBridgeAction(() => clientBridge.setConsent(granted))
    if (!ok) {
      setBridge((prev) => (prev ? { ...prev, pluginConsentGranted: previous } : prev))
    }
  }

  async function runBridgeAction(
    action: () => Promise<ClientBridgeStatus>,
    successMessage?: string,
  ): Promise<boolean> {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const next = await action()
      setBridge(next)
      setPluginsDirDraft(next.customPluginsDir ?? next.pengu.effectivePluginsDir ?? '')
      const adapter = await clientSurfaces.getAdapterStatus().catch(() => null)
      if (adapter) setAdapterStatus(adapter)
      setStatus(successMessage ?? next.message)
      return true
    } catch (e) {
      setError(errorMessage(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleExportPluginZip() {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const b64 = await clientBridge.exportPluginZip()
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'laap-companion-pengu-plugin.zip'
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setStatus('Exported standalone laap-companion Pengu plugin archive (.zip).')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const categories = ['all', ...(config ? Array.from(new Set(config.surfaces.map((s) => s.category))) : [])]
  const filteredSurfaces = config?.surfaces.filter((s) => category === 'all' || s.category === category)
  const activeCount = config?.surfaces.filter((s) => s.enabled).length ?? 0

  return (
    <>
      <div className="customization-heading">
        <div>
          <h2>League Client Appearance Surfaces</h2>
          <p>
            Configure appearance styling, backdrop blurs, and CSS overrides for 16 distinct League of Legends client screens.
          </p>
        </div>
        <div className="customization-actions">
          <label>Import configuration<input type="file" accept=".json" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void importConfiguration(file); e.target.value = '' }} /></label>
          <button className="btn-secondary" disabled={busy || !config} onClick={() => void exportConfiguration()}>Export configuration JSON</button>
          <button className="btn-primary" disabled={busy || !config} onClick={() => void handleSave()}>
            {busy ? 'Saving…' : 'Save Configuration'}
          </button>
          <button className="btn-secondary" disabled={busy || !config} onClick={() => void handleExportSnippet()}>
            {copiedSnippet ? '✓ Snippet Copied & Downloaded' : 'Save and export CSS snippet'}
          </button>
          <button className="btn-secondary" disabled={busy || !config} onClick={() => void handleReset()}>
            Reset Defaults
          </button>
        </div>
      </div>

      {/* Adapter Status Card */}
      <div
        className="customization-card"
        style={{
          margin: '1rem 0',
          padding: '1rem 1.25rem',
          background: adapterStatus?.isAvailable
            ? 'rgba(16, 185, 129, 0.08)'
            : 'rgba(99, 102, 241, 0.08)',
          border: adapterStatus?.isAvailable
            ? '1px solid rgba(16, 185, 129, 0.35)'
            : '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: '8px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <strong>Client Integration Status</strong>
            <p style={{ margin: '0.25rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              {adapterStatus?.message || `${activeCount}/16 surfaces enabled.`}
            </p>
          </div>
          <span
            className="badge"
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              background: adapterStatus?.isAvailable
                ? 'rgba(16, 185, 129, 0.15)'
                : 'rgba(245, 158, 11, 0.15)',
              color: adapterStatus?.isAvailable ? '#34d399' : '#f59e0b',
              border: adapterStatus?.isAvailable
                ? '1px solid rgba(16, 185, 129, 0.35)'
                : '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            {adapterStatus?.isAvailable
              ? bridge && bridge.activeClients > 0
                ? `Bridge Active · ${bridge.activeClients} peer(s) connected`
                : 'Bridge Active · Companion plugin ready'
              : 'Configuration only · Integration unavailable'}
          </span>
        </div>
      </div>

      {/* Rose-Model Loopback Bridge & Companion Plugin Card */}
      {bridge && (
        <div
          className="customization-card"
          data-testid="companion-bridge-card"
          style={{
            margin: '0 0 1rem 0',
            padding: '1rem 1.25rem',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <div>
              <strong>In-Client Companion Bridge (Authenticated Loopback)</strong>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {bridge.message}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={bridge.running ? 'btn-secondary' : 'btn-primary'}
                disabled={busy}
                onClick={() => void runBridgeAction(() => (bridge.running ? clientBridge.stop() : clientBridge.start()))}
              >
                {bridge.running ? 'Stop Loopback Bridge' : 'Start Loopback Bridge'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => void runBridgeAction(() => clientBridge.rotateToken(), 'Rotated loopback bearer token and updated companion plugin config.')}
              >
                Rotate Bearer Token
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>
            <span>Protocol: <strong>v{bridge.protocolVersion}</strong></span>
            <span>Endpoint: <strong>{bridge.running && bridge.bridgeUrl ? bridge.bridgeUrl : 'Stopped (127.0.0.1)'}</strong></span>
            <span>Bearer Token: <code>{bridge.tokenPreview}</code></span>
            <span>Connected Peers: <strong>{bridge.activeClients}</strong></span>
            {bridge.lastHandshake && (
              <span>Last Peer: <strong>{bridge.lastHandshake.clientName} v{bridge.lastHandshake.pluginVersion}</strong></span>
            )}
          </div>

          <div style={{ paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div>
                <strong>Optional Pengu Loader Companion Plugin (<code>laap-companion</code>)</strong>
                <p style={{ margin: '0.2rem 0 0.5rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {bridge.pengu.detail}
                </p>
              </div>
              <span style={{ fontSize: '0.8rem', color: bridge.pluginInstalled ? '#34d399' : '#94a3b8' }}>
                {bridge.pluginInstalled
                  ? bridge.pluginVerified
                    ? '✓ Installed & receipt-verified'
                    : 'Installed (config sync needed)'
                  : 'Not installed'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.65rem' }}>
              <input
                type="text"
                aria-label="Pengu Loader plugins directory"
                value={pluginsDirDraft}
                onChange={(e) => setPluginsDirDraft(e.target.value)}
                placeholder="Path to Pengu Loader plugins folder"
                style={{ flex: '1 1 260px', padding: '0.45rem 0.65rem' }}
              />
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => void runBridgeAction(() => clientBridge.setPluginsDir(pluginsDirDraft.trim() || null))}
              >
                Save Folder
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => void runBridgeAction(() => clientBridge.pickPluginsDir())}
              >
                Browse Folder…
              </button>
            </div>

            <label className="customization-check" style={{ marginBottom: '0.75rem' }}>
              <input
                type="checkbox"
                checked={bridge.pluginConsentGranted}
                disabled={busy}
                onChange={(e) => void handleToggleConsent(e.target.checked)}
              />
              I authorize LAAP to install and manage its reversible <code>laap-companion</code> folder inside the Pengu Loader plugins directory (does not bundle third-party binaries or unlock paid Riot skins).
            </label>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !bridge.pluginConsentGranted || (!bridge.pengu.effectivePluginsDir && !pluginsDirDraft.trim())}
                onClick={() =>
                  void runBridgeAction(() =>
                    clientBridge.installPlugin(pluginsDirDraft.trim() || bridge.customPluginsDir || null),
                  )
                }
              >
                {bridge.pluginInstalled ? 'Update Companion Plugin' : 'Install Companion Plugin'}
              </button>
              {bridge.pluginInstalled && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => void runBridgeAction(() => clientBridge.uninstallPlugin())}
                >
                  Uninstall Companion Plugin
                </button>
              )}
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => void handleExportPluginZip()}
              >
                Export Standalone Plugin .zip
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p role="alert">{error}</p>}
      {status && <p role="status" style={{ color: '#10b981' }}>{status}</p>}

      {config && (
        <>
          <div className="customization-filters" style={{ justifyContent: 'space-between' }}>
            <label className="customization-check" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={config.globalEnabled}
                onChange={(e) => setConfig({ ...config, globalEnabled: e.target.checked })}
              />
              <strong>Enable Client Surface Customizations ({activeCount}/16 active)</strong>
            </label>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Category:</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === 'all' ? 'All Surfaces (16)' : c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '1rem',
              marginTop: '1rem',
            }}
          >
            {filteredSurfaces?.map((surface) => {
              const isExpanded = expandedId === surface.id
              return (
                <div
                  key={surface.id}
                  className="customization-card"
                  style={{
                    padding: '1rem',
                    borderLeft: surface.enabled ? '4px solid var(--accent, #6366f1)' : '4px solid #4b5563',
                    opacity: config.globalEnabled ? 1 : 0.6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <strong style={{ fontSize: '1rem' }}>{surface.name}</strong>
                      <span
                        className="badge"
                        style={{
                          display: 'inline-block',
                          marginLeft: '8px',
                          fontSize: '0.7rem',
                          padding: '1px 6px',
                          background: 'rgba(255,255,255,0.08)',
                          borderRadius: '4px',
                        }}
                      >
                        {surface.category}
                      </span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        aria-label={`Enable ${surface.name} definition`}
                        disabled={busy}
                        checked={surface.enabled}
                        onChange={(e) => updateSurface(surface.id, { enabled: e.target.checked })}
                      />
                    </label>
                  </div>

                  <p style={{ margin: '0.5rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {surface.description}
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem' }}>
                      Opacity: {Math.round(surface.opacity * 100)}%
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={surface.opacity}
                        onChange={(e) => updateSurface(surface.id, { opacity: parseFloat(e.target.value) })}
                      />
                    </label>
                    <label style={{ fontSize: '0.8rem' }}>
                      Backdrop Blur: {surface.blurPx}px
                      <input
                        type="range"
                        min="0"
                        max="20"
                        step="1"
                        value={surface.blurPx}
                        onChange={(e) => updateSurface(surface.id, { blurPx: parseInt(e.target.value, 10) })}
                      />
                    </label>
                  </div>

                  <div style={{ marginTop: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem' }}>
                      Asset / Background URL:
                      <input
                        placeholder="https://… (reference only)"
                        value={surface.assetUrl ?? ''}
                        onChange={(e) => updateSurface(surface.id, { assetUrl: e.target.value.trim() || undefined })}
                      />
                    </label>
                  </div>

                  <div style={{ marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: '100%', fontSize: '0.8rem', padding: '4px' }}
                      onClick={() => setExpandedId(isExpanded ? null : surface.id)}
                    >
                      {isExpanded ? 'Hide CSS Overrides ▲' : 'Edit CSS Overrides ▼'}
                    </button>
                    {isExpanded && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <textarea
                          rows={4}
                          style={{
                            width: '100%',
                            fontFamily: 'monospace',
                            fontSize: '0.8rem',
                            resize: 'vertical',
                          }}
                          placeholder={`.custom-class { color: #b388ff; }`}
                          value={surface.cssOverrides}
                          onChange={(e) => updateSurface(surface.id, { cssOverrides: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
