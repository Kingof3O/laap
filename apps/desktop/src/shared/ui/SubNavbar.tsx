import { LayoutGrid, List, Plus, Search, X } from 'lucide-react'
import { AVAILABLE_REGIONS } from '../../lib/constants'
import type { Region, ViewMode } from '../../lib/types'

export interface SubNavbarProps {
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
}: SubNavbarProps) {
  return (
    <div className="sub-navbar">
      {/* Search & Region Filters */}
      <div className="filter-controls">
        {/* Search Box */}
        <div className="search-box">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search profiles or regions…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchQuery ? (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          ) : null}
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

      {/* View Switcher & Add Action */}
      <div className="view-action-controls">
        <div className="view-mode-toggle" aria-label="Layout view switcher">
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'grid' ? 'view-toggle-btn-active' : ''}`}
            onClick={() => onViewModeChange('grid')}
            title="Grid View"
            aria-label="Grid View"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'list' ? 'view-toggle-btn-active' : ''}`}
            onClick={() => onViewModeChange('list')}
            title="List View"
            aria-label="List View"
          >
            <List size={14} />
          </button>
        </div>

        {onAddAccount ? (
          <button
            type="button"
            className="btn-add-primary"
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
