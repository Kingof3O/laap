import { useEffect, useState } from 'react'
import {
  clientSurfaces,
  errorMessage,
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
  const [category, setCategory] = useState<string>('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [copiedSnippet, setCopiedSnippet] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function load() {
    setBusy(true)
    setError('')
    try {
      const [cfg, adapter] = await Promise.all([
        clientSurfaces.getConfig(),
        clientSurfaces.getAdapterStatus(),
      ])
      setConfig(cfg)
      setAdapterStatus(adapter)
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
      const adapter = await clientSurfaces.getAdapterStatus()
      setAdapterStatus(adapter)
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
      const adapter = await clientSurfaces.getAdapterStatus()
      setAdapterStatus(adapter)
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
      const css = await clientSurfaces.exportSnippet()
      // Copy to clipboard
      await navigator.clipboard.writeText(css)
      setCopiedSnippet(true)
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

      setStatus('CSS snippet copied to clipboard and downloaded as laap-client-surfaces.css.')
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
          <button className="btn-primary" disabled={busy || !config} onClick={() => void handleSave()}>
            {busy ? 'Saving…' : 'Save Configuration'}
          </button>
          <button className="btn-secondary" disabled={busy || !config} onClick={() => void handleExportSnippet()}>
            {copiedSnippet ? '✓ Snippet Copied & Downloaded' : 'Export CSS Snippet'}
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
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: '8px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>Client Injection Adapter Status</strong>
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
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#f59e0b',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            Vanguard Safe · Snippet Mode
          </span>
        </div>
      </div>

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
                        placeholder="https://... or local data URI"
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
                          placeholder={`/* Custom CSS overrides for ${surface.name} */\n.custom-class { ... }`}
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
