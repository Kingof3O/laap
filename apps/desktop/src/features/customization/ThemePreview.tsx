import { useEffect, useState, type FormEvent } from 'react'
import { invokeTauri } from '../../lib/api'
import { errorMessage, themes, type ThemeConfig } from './api'
import { readFileBase64 } from './packageFiles'

const DEFAULT_THEME: ThemeConfig = {
  id: 'velvet-amethyst',
  name: 'Velvet Amethyst',
  author: 'LAAP Team',
  version: '1.0.0',
  isBuiltin: true,
  palette: {
    background: '#161121',
    surface: '#282038',
    primary: '#d6b7ff',
    secondary: '#8a72b2',
    accent: '#d6b7ff',
    text: '#ffffff',
    textMuted: '#94a3b8',
    border: '#3b3366',
  },
  fontFamily: 'Manrope',
  animationsEnabled: true,
}

export function ThemePreview() {
  const [themeList, setThemeList] = useState<ThemeConfig[]>([DEFAULT_THEME])
  const [activeTheme, setActiveTheme] = useState<ThemeConfig | null>(DEFAULT_THEME)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  // Media file state
  const [mediaFile, setMediaFile] = useState<File | null>(null)

  async function load() {
    setError('')
    try {
      const allThemes = await themes.list()
      const list = Array.isArray(allThemes) && allThemes.length > 0 ? allThemes : [DEFAULT_THEME]
      setThemeList(list)
      const current = await themes.getActive()
      setActiveTheme(current || list[0] || DEFAULT_THEME)
    } catch (cause) {
      setError(errorMessage(cause))
      setThemeList([DEFAULT_THEME])
      setActiveTheme(DEFAULT_THEME)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function selectTheme(id: string) {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const activated = await themes.setActive(id)
      setActiveTheme(activated)
      setStatus(`Activated theme "${activated.name}".`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveCustom(event: FormEvent) {
    event.preventDefault()
    if (!activeTheme) return
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const saved = await themes.saveCustom(activeTheme)
      // Also persist legacy preview state for backward-compatibility
      await invokeTauri('theme_preview_save', {
        preview: {
          schemaVersion: 1,
          name: activeTheme.name,
          canvas: activeTheme.palette.background,
          panel: activeTheme.palette.surface,
          accent: activeTheme.palette.primary,
          font: activeTheme.fontFamily.toLowerCase() === 'sora' ? 'sora' : 'manrope',
        },
      }).catch(() => {})
      setActiveTheme(saved)
      await load()
      setStatus(`Theme "${saved.name}" saved.`)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function handleResetDefault() {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const def = await themes.resetDefault()
      setActiveTheme(def)
      await load()
      setStatus('Reset to default Velvet Amethyst theme.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleUploadMedia() {
    if (!mediaFile || !activeTheme) return
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const b64 = await readFileBase64(mediaFile)
      const mime = mediaFile.type || 'image/jpeg'
      const assetPath = await themes.saveMedia(b64, mime)

      const updated = {
        ...activeTheme,
        customMedia: {
          ...activeTheme.customMedia,
          wallpaperUrl: assetPath,
          backgroundVideo: mediaFile.type.includes('video') ? assetPath : undefined,
          backgroundGif: mediaFile.type.includes('gif') ? assetPath : undefined,
        },
      }
      setActiveTheme(updated)
      await themes.saveCustom(updated)
      setStatus(`Custom background media "${mediaFile.name}" applied.`)
      setMediaFile(null)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="customization-heading">
        <div>
          <h2>Theme workshop & appearance</h2>
          <p>Customize palettes, fonts, and client background animations. Includes 8 built-in themes.</p>
        </div>
        <div className="customization-actions">
          <button className="btn-secondary" disabled={busy} onClick={() => void handleResetDefault()}>Reset to Default</button>
        </div>
      </div>

      <p className="customization-source">Live Preview: Theme selections apply locally to the LAAP Studio interface. Background video and audio loops stay local to this machine.</p>

      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}

      {/* Built-in and Custom Themes Grid */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h3>Theme collection ({themeList.length})</h3>
        <div className="customization-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {themeList.map((t) => (
            <div
              key={t.id}
              className="customization-card"
              style={{
                cursor: 'pointer',
                borderColor: activeTheme?.id === t.id ? 'var(--accent, #6366f1)' : undefined,
                background: t.palette.background,
                color: t.palette.text,
                padding: '1rem',
                borderRadius: '8px',
                borderWidth: activeTheme?.id === t.id ? '2px' : '1px',
              }}
              onClick={() => void selectTheme(t.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: t.palette.text }}>{t.name}</strong>
                {t.isBuiltin && <span className="badge" style={{ fontSize: '0.7rem', padding: '1px 5px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>Built-in</span>}
              </div>
              <div style={{ display: 'flex', gap: '4px', margin: '0.5rem 0' }}>
                <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: t.palette.primary }} title="Primary" />
                <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: t.palette.secondary }} title="Secondary" />
                <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: t.palette.accent }} title="Accent" />
                <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: t.palette.surface }} title="Surface" />
              </div>
              <span style={{ fontSize: '0.75rem', color: t.palette.textMuted }}>{t.fontFamily}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Editor & Preview */}
      {activeTheme && (
        <div className="customization-detail">
          <form className="customization-editor" onSubmit={(event) => void saveCustom(event)}>
            <h3>Theme palette editor</h3>
            <label>Theme name
              <input required maxLength={100} value={activeTheme.name} onChange={(event) => setActiveTheme({ ...activeTheme, name: event.target.value })} />
            </label>
            <div className="customization-filters">
              <label>Background <input type="color" value={activeTheme.palette.background} onChange={(e) => setActiveTheme({ ...activeTheme, palette: { ...activeTheme.palette, background: e.target.value } })} /></label>
              <label>Surface <input type="color" value={activeTheme.palette.surface} onChange={(e) => setActiveTheme({ ...activeTheme, palette: { ...activeTheme.palette, surface: e.target.value } })} /></label>
              <label>Primary <input type="color" value={activeTheme.palette.primary} onChange={(e) => setActiveTheme({ ...activeTheme, palette: { ...activeTheme.palette, primary: e.target.value } })} /></label>
              <label>Accent <input type="color" value={activeTheme.palette.accent} onChange={(e) => setActiveTheme({ ...activeTheme, palette: { ...activeTheme.palette, accent: e.target.value } })} /></label>
            </div>
            <label>Font family
              <select value={activeTheme.fontFamily} onChange={(e) => setActiveTheme({ ...activeTheme, fontFamily: e.target.value })}>
                <option value="Manrope">Manrope</option>
                <option value="Sora">Sora</option>
                <option value="Segoe UI">Segoe UI</option>
                <option value="Inter">Inter</option>
              </select>
            </label>
            <label className="customization-check">
              <input type="checkbox" checked={activeTheme.animationsEnabled} onChange={(e) => setActiveTheme({ ...activeTheme, animationsEnabled: e.target.checked })} />
              Enable smooth UI transitions & animations
            </label>

            {/* Custom media section */}
            <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.75rem' }}>
              <h4>Custom background media (Video / GIF / Wallpaper)</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Upload an MP4, WebM, GIF, or image to use as animated background.</p>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="file" accept="video/mp4,video/webm,image/gif,image/png,image/jpeg,image/webp" onChange={(e) => setMediaFile(e.target.files?.[0] ?? null)} />
                <button type="button" className="btn-secondary" disabled={busy || !mediaFile} onClick={() => void handleUploadMedia()}>Upload media</button>
              </div>
            </div>

            <div className="customization-actions" style={{ marginTop: '1rem' }}>
              <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save theme'}</button>
            </div>
          </form>

          {/* Live theme preview card */}
          <div
            className="theme-preview"
            style={{
              background: activeTheme.palette.background,
              fontFamily: activeTheme.fontFamily,
              color: activeTheme.palette.text,
              borderRadius: '12px',
              border: `1px solid ${activeTheme.palette.border}`,
              padding: '1.5rem',
            }}
            aria-label="Theme preview"
          >
            <div style={{ background: activeTheme.palette.surface, borderColor: activeTheme.palette.accent, border: '1px solid', borderRadius: '8px', padding: '1rem' }}>
              <span style={{ fontSize: '0.75rem', color: activeTheme.palette.textMuted }}>THEME PREVIEW</span>
              <h3 style={{ margin: '0.25rem 0', color: activeTheme.palette.text }}>{activeTheme.name}</h3>
              <p style={{ fontSize: '0.85rem', color: activeTheme.palette.textMuted }}>Custom styling applied locally.</p>
              <div style={{ display: 'flex', gap: '8px', marginTop: '0.75rem' }}>
                <span className="theme-sample" style={{ background: activeTheme.palette.primary, padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', color: '#fff' }}>Primary</span>
                <span className="theme-sample" style={{ background: activeTheme.palette.accent, padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', color: '#000' }}>Accent</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
