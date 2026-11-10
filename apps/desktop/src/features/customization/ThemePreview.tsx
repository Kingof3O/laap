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

  return (
    <>
      <h2>Theme workshop</h2>
      <p>Design a local color and typography preview. Applying themes to the Riot client requires an approved integration.</p>
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
