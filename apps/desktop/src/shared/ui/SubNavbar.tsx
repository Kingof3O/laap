import { RegionSelect } from './RegionSelect'
import { LayoutGrid, List, Plus, Search, X } from 'lucide-react'
import type { SortOrder } from '../../lib/sorting'
import type { Region, ViewMode } from '../../lib/types'

export interface SubNavbarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  selectedRegion: Region
  onRegionChange: (region: Region) => void
  selectedRank?: string
  rankOptions?: string[]
  onRankChange?: (rank: string) => void
  sortOrder?: SortOrder
  onSortChange?: (order: SortOrder) => void
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
  selectedRank = 'all',
  rankOptions = [],
  onRankChange,
  sortOrder = 'name-asc',
  onSortChange,
  viewMode,
  onViewModeChange,
  onAddAccount,
  addButtonLabel = 'Add Profile',
  totalCount = 0,
}: SubNavbarProps) {
  const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac')
  const shortcutHint = isMac ? '⌘K' : 'Ctrl+K'

  return (
    <div className="sub-navbar">
      {/* Search & Filtering Toolbar */}
      <div className="filter-controls">
        <div className="search-box">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search accounts or regions…"
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
              <X size={13} />
            </button>
          ) : (
            <span className="search-shortcut">{shortcutHint}</span>
          )}
        </div>

        <div className="toolbar-region-select">
          <RegionSelect
            label="Filter by region"
            includeAll
            value={selectedRegion}
            onChange={(region) => onRegionChange(region as Region)}
          />
        </div>

        {onRankChange ? (
          <select
            className="rank-filter"
            aria-label="Filter by rank"
            value={selectedRank}
            onChange={(e) => onRankChange(e.target.value)}
          >
            <option value="all">All ranks</option>
            <option value="unlabeled">No rank set</option>
            {rankOptions.map((rank) => (
              <option
                key={rank.toLowerCase()}
                value={`rank:${rank.toLowerCase()}`}
              >
                {rank}
              </option>
            ))}
          </select>
        ) : null}

        {onSortChange ? (
          <label className="sort-control">
            <span>Sort by</span>
            <select
              className="rank-filter"
              aria-label="Sort by"
              value={sortOrder}
              onChange={(e) => onSortChange(e.target.value as SortOrder)}
            >
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="last-played-desc">Recently played</option>
              <option value="last-played-asc">Oldest played</option>
              <option value="date-added-desc">Recently added</option>
              <option value="date-added-asc">Oldest added</option>
              <option value="rank-desc">Rank (High to Low)</option>
              <option value="rank-asc">Rank (Low to High)</option>
            </select>
          </label>
        ) : null}
      </div>

      {/* View Mode & Add Action */}
      <div className="view-action-controls">
        <span className="badge badge-muted" style={{ padding: '5px 10px', fontSize: '12px' }}>
          {totalCount} {totalCount === 1 ? 'Profile' : 'Profiles'}
        </span>

        <div className="view-mode-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'grid' ? 'view-toggle-btn-active' : ''}`}
            onClick={() => onViewModeChange('grid')}
            title="Grid View"
            aria-label="Grid View"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'list' ? 'view-toggle-btn-active' : ''}`}
            onClick={() => onViewModeChange('list')}
            title="List View"
            aria-label="List View"
          >
            <List size={15} />
          </button>
        </div>

        {onAddAccount ? (
          <button
            type="button"
            className="btn-add-primary"
            onClick={onAddAccount}
          >
            <Plus size={15} />
            <span>{addButtonLabel}</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
