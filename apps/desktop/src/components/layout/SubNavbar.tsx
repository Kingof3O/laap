import { LayoutGrid, List, Plus, Search, X } from 'lucide-react'
import { AVAILABLE_REGIONS } from '../../lib/constants'
import type { Region, ViewMode } from '../../lib/types'

interface SubNavbarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  selectedRegion: Region
  onRegionChange: (region: Region) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onAddAccount?: () => void
  addButtonLabel?: string
  totalCount: number
}

export function SubNavbar({
  searchQuery,
  onSearchChange,
  selectedRegion,
  onRegionChange,
  viewMode,
  onViewModeChange,
  onAddAccount,
  addButtonLabel = 'Add Profile',
  totalCount,
}: SubNavbarProps) {
  return (
    <div className="sub-navbar">
      {/* Search & Region Filters */}
      <div className="filter-controls">
        {/* Instant Search Box */}
        <div className="search-box">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Filter summoners or riot IDs…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchQuery ? (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => onSearchChange('')}
            >
              <X size={12} />
            </button>
          ) : (
            <span className="search-shortcut">⌘K</span>
          )}
        </div>

        {/* Region Pills */}
        <div className="region-filter-bar">
          {AVAILABLE_REGIONS.slice(0, 6).map((region) => (
            <button
              key={region}
              type="button"
              className={`region-pill ${selectedRegion === region ? 'region-pill-active' : ''}`}
              onClick={() => onRegionChange(region)}
            >
              {region}
            </button>
          ))}
        </div>
      </div>

      {/* Right Controls: View Mode Switcher + Add Action */}
      <div className="action-controls">
        <div className="view-mode-toggle">
          <button
            type="button"
            className={`view-btn ${viewMode === 'grid' ? 'view-btn-active' : ''}`}
            onClick={() => onViewModeChange('grid')}
            title="Tactical Grid View"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            type="button"
            className={`view-btn ${viewMode === 'list' ? 'view-btn-active' : ''}`}
            onClick={() => onViewModeChange('list')}
            title="High-Density Table View"
          >
            <List size={14} />
          </button>
        </div>

        <span className="count-tag">
          {totalCount} {totalCount === 1 ? 'Profile' : 'Profiles'}
        </span>

        {onAddAccount ? (
          <button
            type="button"
            className="btn-gold-action"
            onClick={onAddAccount}
          >
            <Plus size={14} />
            <span>{addButtonLabel}</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
