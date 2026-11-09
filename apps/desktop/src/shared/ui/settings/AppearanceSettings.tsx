import { useState } from 'react'
import { LayoutGrid, List } from 'lucide-react'
import { VIEW_MODE_KEY } from '../../../lib/constants'
import type { ViewMode } from '../../../lib/types'

interface AppearanceSettingsProps {
  disabled?: boolean
}

export function AppearanceSettings({ disabled = false }: AppearanceSettingsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || 'grid'
    } catch {
      return 'grid'
    }
  })

  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    try {
      return localStorage.getItem('laap_reduced_motion') === 'true'
    } catch {
      return false
    }
  })

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode)
      window.dispatchEvent(new Event('laap:viewmode-change'))
    } catch {}
  }

  const handleReducedMotionToggle = (enabled: boolean) => {
    setReducedMotion(enabled)
    try {
      localStorage.setItem('laap_reduced_motion', String(enabled))
      if (enabled) {
        document.documentElement.classList.add('reduced-motion')
      } else {
        document.documentElement.classList.remove('reduced-motion')
      }
    } catch {}
  }

  return (
    <div className="settings-section" aria-label="Appearance Settings">
      <div className="settings-section-header">
        <h3 className="settings-section-title">Interface & Appearance</h3>
        <p className="settings-section-desc">
          Customize display layout, animations, and visual presentation.
        </p>
      </div>

      {/* Roster Layout Mode */}
      <div className="settings-card">
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
          Default Roster Layout
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className={`btn-secondary ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => handleViewModeChange('grid')}
            disabled={disabled}
            style={{
              flex: 1,
              height: '42px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              border: viewMode === 'grid' ? '1px solid var(--border-gold-focus)' : undefined,
              background: viewMode === 'grid' ? 'var(--bg-card-selected)' : undefined,
            }}
          >
            <LayoutGrid size={16} />
            <span>Interactive Grid</span>
          </button>

          <button
            type="button"
            className={`btn-secondary ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => handleViewModeChange('list')}
            disabled={disabled}
            style={{
              flex: 1,
              height: '42px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              border: viewMode === 'list' ? '1px solid var(--border-gold-focus)' : undefined,
              background: viewMode === 'list' ? 'var(--bg-card-selected)' : undefined,
            }}
          >
            <List size={16} />
            <span>Compact Table</span>
          </button>
        </div>
      </div>

      {/* Visual Motion */}
      <div className="settings-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Reduced Motion
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Minimize animations and visual transition effects for increased performance.
            </div>
          </div>
          <input
            type="checkbox"
            aria-label="Reduced motion"
            checked={reducedMotion}
            onChange={(e) => handleReducedMotionToggle(e.target.checked)}
            disabled={disabled}
            className="settings-switch"
          />
        </div>
      </div>

    </div>
  )
}
