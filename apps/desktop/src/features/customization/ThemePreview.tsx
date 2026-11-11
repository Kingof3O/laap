import { useEffect, useState, type FormEvent } from 'react'
import { invokeTauri } from '../../lib/api'
import { errorMessage } from './api'

interface Theme {
  schemaVersion: 1
  name: string
  canvas: string
  panel: string
  accent: string
  font: 'manrope' | 'sora'
}

const DEFAULT: Theme = {
  schemaVersion: 1, name: 'Velvet Amethyst', canvas: '#161121', panel: '#282038',
  accent: '#d6b7ff', font: 'manrope',
}

const GALLERY_THEMES: Theme[] = [
  DEFAULT,
  { schemaVersion: 1, name: 'Obsidian Neon', canvas: '#0c0d12', panel: '#161922', accent: '#00ffcc', font: 'sora' },
  { schemaVersion: 1, name: 'Cyber Hextech', canvas: '#091428', panel: '#0a3240', accent: '#c8aa6e', font: 'sora' },
  { schemaVersion: 1, name: 'Ionian Blossom', canvas: '#1f141e', panel: '#331c2d', accent: '#ff94b8', font: 'manrope' },
  { schemaVersion: 1, name: 'Noxian Iron', canvas: '#180b0b', panel: '#2d1313', accent: '#e84057', font: 'manrope' },
]

export function ThemePreview() {
  const [theme, setTheme] = useState<Theme | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  function load() {
    setError('')
    void invokeTauri<Theme | null>('theme_preview_load').then((saved) => setTheme(saved ?? DEFAULT))
      .catch((cause: unknown) => setError(errorMessage(cause)))
  }

  useEffect(() => { load() }, [])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!theme) return
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await invokeTauri('theme_preview_save', { theme })
      setStatus('Theme preview saved locally.')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  function exportTheme() {
    if (!theme) return
    const data = JSON.stringify(theme, null, 2)
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${theme.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-theme.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    setStatus('Theme exported as JSON.')
  }

  function importTheme(file?: File) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Theme
        if (parsed.schemaVersion === 1 && parsed.name && parsed.canvas && parsed.panel && parsed.accent) {
          setTheme(parsed)
          setStatus(`Imported theme "${parsed.name}".`)
        } else {
          setError('Invalid theme file format.')
        }
      } catch {
        setError('Failed to parse theme JSON file.')
      }
    }
    reader.readAsText(file)
  }

  return (
    <>
      <h2>Theme workshop</h2>
      <p>Design a local color and typography preview. Local theme edits apply only to LAAP previews.</p>
      <p className="customization-source">Client Appearance Adapter: GATED / DISABLED. Directly altering League Client stylesheets requires an approved third-party loader integration with separate platform and license consent.</p>
      <div className="customization-filters">
        <label>Preset gallery:
          <select onChange={(e) => {
            const found = GALLERY_THEMES.find((t) => t.name === e.target.value)
            if (found) { setTheme(found); setStatus(`Loaded preset "${found.name}".`) }
          }} value={theme?.name ?? ''}>
            {GALLERY_THEMES.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        </label>
        <button className="btn-secondary" type="button" onClick={exportTheme} disabled={!theme || busy}>Export theme</button>
        <label className="btn-secondary">Import theme
          <input type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => {
            importTheme(e.target.files?.[0])
            e.target.value = ''
          }} />
        </label>
      </div>
      {error && <p role="alert">{error} {!theme && <button className="btn-secondary" onClick={load}>Retry</button>}</p>}
      {status && <p role="status">{status}</p>}
      {!theme && !error && <p role="status">Loading theme…</p>}
      {theme && <div className="customization-detail">
        <form className="customization-editor" onSubmit={(event) => void save(event)}>
          <label>Theme name <input required maxLength={100} value={theme.name} onChange={(event) => setTheme({ ...theme, name: event.target.value })} /></label>
          <div className="customization-filters">
            <label>Canvas <input type="color" value={theme.canvas} onChange={(event) => setTheme({ ...theme, canvas: event.target.value })} /></label>
            <label>Panel <input type="color" value={theme.panel} onChange={(event) => setTheme({ ...theme, panel: event.target.value })} /></label>
            <label>Accent <input type="color" value={theme.accent} onChange={(event) => setTheme({ ...theme, accent: event.target.value })} /></label>
          </div>
          <label>Typeface <select value={theme.font} onChange={(event) => setTheme({ ...theme, font: event.target.value === 'sora' ? 'sora' : 'manrope' })}>
            <option value="manrope">Manrope</option><option value="sora">Sora</option>
          </select></label>
          <div className="customization-actions">
            <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save theme'}</button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setTheme(DEFAULT); setStatus('') }}>Reset draft</button>
          </div>
        </form>
        <div className="theme-preview" style={{ background: theme.canvas, fontFamily: theme.font === 'sora' ? 'Sora' : 'Manrope' }} aria-label="Theme preview">
          <div style={{ background: theme.panel, borderColor: theme.accent }}>
            <span>LOCAL PREVIEW</span><strong>{theme.name}</strong>
            <span className="theme-sample" style={{ background: theme.accent }} />
          </div>
        </div>
      </div>}
    </>
  )
}
