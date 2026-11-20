import { useEffect, useRef } from 'react'
import { RegionSelect } from './RegionSelect'
import { LayoutGrid, List, Plus, Search, X, SlidersHorizontal, Star } from 'lucide-react'
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
  favoritesOnly?: boolean
  onFavoritesOnlyChange?: (favOnly: boolean) => void
  favoriteCount?: number
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
  favoritesOnly = false,
  onFavoritesOnlyChange,
  favoriteCount,
  viewMode,
  onViewModeChange,
  onAddAccount,
  addButtonLabel = 'Add Profile',
  totalCount = 0,
}: SubNavbarProps) {
  const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac')
  const shortcutHint = isMac ? '⌘K' : 'Ctrl+K'
  const filtersRef = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const dismiss = (event: MouseEvent) => { if (filtersRef.current?.open && !filtersRef.current.contains(event.target as Node)) filtersRef.current.open = false }
    document.addEventListener('mousedown', dismiss)
    return () => document.removeEventListener('mousedown', dismiss)
  }, [])

  const activeFilterCount =
    Number(selectedRegion !== 'ALL') +
    Number(selectedRank !== 'all') +
    Number(Boolean(favoritesOnly))

  return (
    <div className="sub-navbar">
      {/* Search & Filtering Toolbar */}
      <div className="filter-controls">
        <div className="search-box">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            className="search-input"
            aria-label="Search accounts or regions"
            placeholder="Search profiles…"
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

        {onFavoritesOnlyChange ? (
          <button
            type="button"
            className={`star-filter-btn ${favoritesOnly ? 'star-filter-active' : ''}`}
            onClick={() => onFavoritesOnlyChange(!favoritesOnly)}
            title={favoritesOnly ? 'Showing starred accounts only (click to show all)' : 'Filter to starred accounts'}
            aria-label="Filter starred accounts"
            aria-pressed={favoritesOnly}
          >
            <Star
              size={14}
              fill={favoritesOnly ? '#e5ac59' : 'none'}
              color={favoritesOnly ? '#e5ac59' : 'currentColor'}
            />
            <span>Starred</span>
            {typeof favoriteCount === 'number' && favoriteCount > 0 ? (
              <span className="star-filter-count">{favoriteCount}</span>
            ) : null}
          </button>
        ) : null}

        <details ref={filtersRef} className="filter-menu" onKeyDown={(event) => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() } }}>
          <summary>
            <SlidersHorizontal size={15} /> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </summary>
          <div className="filter-menu-content">
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

            {onFavoritesOnlyChange ? (
              <label className="filter-starred-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(favoritesOnly)}
                  onChange={(e) => onFavoritesOnlyChange(e.target.checked)}
                />
                <Star
                  size={13}
                  fill={favoritesOnly ? '#e5ac59' : 'none'}
                  color={favoritesOnly ? '#e5ac59' : 'currentColor'}
                />
                <span>Show starred accounts only</span>
              </label>
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
                  <option value="favorites-first">Starred first</option>
                  <option value="rank-desc">Rank (High to Low)</option>
                  <option value="rank-asc">Rank (Low to High)</option>
                  <option value="region-asc">Region (A-Z)</option>
                  <option value="region-desc">Region (Z-A)</option>
                  <option value="last-played">Recently played</option>
                  <option value="added-desc">Recently added</option>
                  <option value="added-asc">Oldest added</option>
                </select>
              </label>
            ) : null}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                onRegionChange('ALL')
                onRankChange?.('all')
                onSortChange?.('name-asc')
                onFavoritesOnlyChange?.(false)
              }}
            >
              Clear filters
            </button>
          </div>
        </details>
      </div>

      {/* View Mode & Add Action */}
      <div className="view-action-controls">
        <span className="account-count">
          {totalCount} {totalCount === 1 ? 'Profile' : 'Profiles'}
        </span>

        <div className="view-mode-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'grid' ? 'view-toggle-btn-active' : ''}`}
            onClick={() => onViewModeChange('grid')}
            title="Grid View"
            aria-label="Grid View"
            aria-pressed={viewMode === 'grid'}
          >
            <LayoutGrid size={15} />
          </button>
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'list' ? 'view-toggle-btn-active' : ''}`}
            onClick={() => onViewModeChange('list')}
            title="List View"
            aria-label="List View"
            aria-pressed={viewMode === 'list'}
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
