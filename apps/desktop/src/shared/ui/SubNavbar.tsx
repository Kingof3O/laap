import { RegionSelect } from './RegionSelect'
import { LayoutGrid, List, Plus, Search, X, Star } from 'lucide-react'
import type { SortOrder } from '../../lib/sorting'
import type { Game, Region, ViewMode } from '../../lib/types'

export interface SubNavbarProps {
  activeGame?: Game
  onGameChange?: (game: Game) => void
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
  activeGame = 'league',
  onGameChange,
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

  const handleGameSwitch = (game: Game) => {
    if (activeGame !== game) {
      onGameChange?.(game)
      onRankChange?.('all')
    }
  }

  const hasActiveFilters =
    selectedRegion !== 'ALL' ||
    selectedRank !== 'all' ||
    Boolean(favoritesOnly) ||
    Boolean(searchQuery.trim())

  return (
    <div className="sub-navbar">
      {/* Search & Filtering Toolbar */}
      <div className="filter-controls">
        <div className="game-toggle" role="group" aria-label="Active game">
          <button
            type="button"
            className={`game-toggle-btn ${activeGame === 'league' ? 'game-toggle-btn-active' : ''}`}
            onClick={() => handleGameSwitch('league')}
            aria-pressed={activeGame === 'league'}
            aria-label="League of Legends"
            title="League of Legends"
          >
            <img
              src="/league-of-legends-icon.webp"
              alt=""
              className="game-toggle-icon"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            className={`game-toggle-btn ${activeGame === 'valorant' ? 'game-toggle-btn-active' : ''}`}
            onClick={() => handleGameSwitch('valorant')}
            aria-pressed={activeGame === 'valorant'}
            aria-label="VALORANT"
            title="VALORANT"
          >
            <img
              src="/valorant-icon.webp"
              alt=""
              className="game-toggle-icon"
              aria-hidden="true"
            />
          </button>
        </div>

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
            <span className="star-filter-label">Starred</span>
            {typeof favoriteCount === 'number' && favoriteCount > 0 ? (
              <span className="star-filter-count">{favoriteCount}</span>
            ) : null}
          </button>
        ) : null}

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
          <select
            className="rank-filter toolbar-sort-select"
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
        ) : null}

        {hasActiveFilters ? (
          <button
            type="button"
            className="toolbar-reset-btn"
            onClick={() => {
              onRegionChange('ALL')
              onRankChange?.('all')
              onSortChange?.('name-asc')
              onFavoritesOnlyChange?.(false)
              onSearchChange('')
            }}
            title="Reset filters"
            aria-label="Reset filters"
          >
            <X size={12} />
            <span>Reset</span>
          </button>
        ) : null}
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
            aria-label={addButtonLabel || 'Add Profile'}
            title={addButtonLabel || 'Add Profile'}
          >
            <Plus size={15} />
            <span>{addButtonLabel || 'Add Profile'}</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
