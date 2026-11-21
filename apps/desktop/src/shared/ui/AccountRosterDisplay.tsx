import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { AccountCard, type AccountCardProps } from './AccountCard'
import { AccountListTable } from './AccountListTable'
import type { Game, LiveStatusBadge, ViewMode } from '../../lib/types'
import type { SortOrder } from '../../lib/sorting'
import { PanelRightOpen } from 'lucide-react'
import { ProfileInspector } from './ProfileInspector'

export interface RosterItem {
  id: string
  name: string
  region: string
  rank?: string | null
  level?: number | null
  seasonStats?: AccountCardProps['seasonStats']
  valorantRank?: string | null
  games?: Game[]
  riotId?: string | null
  notes?: string
  iconAsset?: string | null
  hasSession: boolean
  lastUsedText?: string | null
  rawLastUsed?: string | null
  createdAt?: string | null
  status?: string
  favorite?: boolean
  liveStatus?: LiveStatusBadge | null
}

export interface AccountRosterDisplayProps {
  items: RosterItem[]
  activeGame?: Game
  viewMode: ViewMode
  busy?: boolean
  launchingId?: string | null
  failedLaunchId?: string | null
  activeLaunchId?: string | null
  launchStatus?: string | null
  launchLabel?: string
  onEdit?: (id: string) => void
  onRefreshSession?: (id: string) => void
  onLaunch: (id: string, game?: Game) => void
  onCheckLive?: (id: string) => void
  showLiveMenuAction?: boolean
  onSync?: (id: string) => void
  toolbarSlot?: ReactNode
  onDelete: (id: string, name: string) => void
  onToggleFavorite?: (id: string) => void
  sortOrder?: SortOrder
  onSortChange?: (order: SortOrder) => void
}

export function AccountRosterDisplay({
  items,
  activeGame = 'league',
  viewMode,
  busy = false,
  launchingId,
  failedLaunchId,
  activeLaunchId,
  launchStatus,
  launchLabel,
  onEdit,
  onRefreshSession,
  onLaunch,
  onCheckLive,
  showLiveMenuAction = false,
  onSync,
  toolbarSlot,
  onDelete,
  onToggleFavorite,
  sortOrder,
  onSortChange,
}: AccountRosterDisplayProps) {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null)
  const [detailsOpen, setDetailsOpen] = useState(() => {
    try { const value = localStorage.getItem('laap_profile_details'); return value === 'false' ? false : true } catch { return true }
  })
  const toggleDetails = (open: boolean) => { setDetailsOpen(open); try { localStorage.setItem('laap_profile_details', String(open)) } catch { /* preference is optional */ } }

  // Find the most recently played account ID to subtly badge it (without repeating it in a hero strip)
  const mostRecentId = useMemo(() => {
    const itemsWithUsage = items.filter(
      (i) => i.rawLastUsed && Number.isFinite(Date.parse(i.rawLastUsed)),
    )
    if (itemsWithUsage.length > 0) {
      return (
        [...itemsWithUsage].sort(
          (a, b) => Date.parse(b.rawLastUsed!) - Date.parse(a.rawLastUsed!),
        )[0]?.id ?? null
      )
    }
    return null
  }, [items])

  const activeHero = items.find((i) => i.id === selectedId) ?? items[0] ?? null

  return (
    <div className="roster-viewport">
      {activeHero?.notes ? (
        <span
          className="hero-notes"
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            padding: 0,
            margin: '-1px',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
          aria-hidden="true"
        >
          {activeHero.notes}
        </span>
      ) : null}
      {viewMode === 'grid' && activeHero ? (
        <div className="roster-heading">
          <div>
            <span className="roster-kicker">
              {activeGame === 'valorant' ? 'YOUR VALORANT ACCOUNTS' : 'YOUR LEAGUE ACCOUNTS'}
            </span>
            <h1>Choose your next session</h1>
          </div>
          <div className="roster-heading-actions">
            {toolbarSlot}
            <button
              type="button"
              className="details-toggle"
              aria-expanded={detailsOpen}
              aria-controls="profile-inspector"
              onClick={() => toggleDetails(!detailsOpen)}
            >
              <PanelRightOpen size={16} />
              {detailsOpen ? 'Hide details' : 'Show details'}
            </button>
          </div>
        </div>
      ) : toolbarSlot ? (
        <div className="roster-list-utility">{toolbarSlot}</div>
      ) : null}
      {viewMode === 'grid' ? (
        <div className={detailsOpen && activeHero ? 'roster-workspace' : 'roster-workspace roster-workspace-full'}>
        <div className="roster-grid" role="region" aria-label="Account Roster">
          {items.map((item) => {
            const isLaunching = launchingId === item.id
            const isFailed = failedLaunchId === item.id
            const isActive = activeLaunchId === item.id
            const isRecent = item.id === mostRecentId
            const isSelected = activeHero?.id === item.id

            return (
              <AccountCard
                key={item.id}
                id={item.id}
                name={item.name}
                region={item.region}
                rank={item.rank}
                level={item.level}
                seasonStats={item.seasonStats}
                valorantRank={item.valorantRank}
                games={item.games}
                activeGame={activeGame}
                riotId={item.riotId}
                notes={item.notes}
                iconAsset={item.iconAsset}
                lastUsedText={item.lastUsedText}
                hasSession={item.hasSession}
                status={item.status}
                liveStatus={item.liveStatus}
                isSelected={isSelected}
                isFavorite={item.favorite}
                isRecent={isRecent}
                busy={busy}
                clientRunning={item.id === activeLaunchId}
                launchStatus={isActive ? launchStatus : null}
                isLaunching={isLaunching}
                launchFailed={isFailed}
                onSelect={() => setSelectedId(item.id)}
                launchLabel={launchLabel}
                onEdit={onEdit ? () => onEdit(item.id) : undefined}
                onRefreshSession={
                  onRefreshSession ? () => onRefreshSession(item.id) : undefined
                }
                onLaunch={() => onLaunch(item.id, activeGame)}
                onRetry={() => onLaunch(item.id, activeGame)}
                onSync={onSync ? () => onSync(item.id) : undefined}
                onDelete={() => onDelete(item.id, item.name)}
                onToggleFavorite={
                  onToggleFavorite ? () => onToggleFavorite(item.id) : undefined
                }
                onCheckLive={onCheckLive ? () => onCheckLive(item.id) : undefined}
                showLiveMenuAction={showLiveMenuAction}
              />
            )
          })}
        </div>
        {detailsOpen && activeHero ? (
          <ProfileInspector
            key={JSON.stringify([activeHero.id, activeHero.name, activeHero.riotId, activeHero.region, activeGame])}
            account={activeHero}
            activeGame={activeGame}
            busy={busy || launchingId === activeHero.id}
            onClose={() => toggleDetails(false)}
            onEdit={onEdit ? () => onEdit(activeHero.id) : undefined}
            onLaunch={() => onLaunch(activeHero.id, activeGame)}
            onCheckLive={activeGame === 'league' && onCheckLive ? () => onCheckLive(activeHero.id) : undefined}
            launchLabel={launchLabel}
          />
        ) : null}
        </div>
      ) : (
        <AccountListTable
          items={items}
          activeGame={activeGame}
          busy={busy}
          launchingId={launchingId}
          failedLaunchId={failedLaunchId}
          activeLaunchId={activeLaunchId}
          launchStatus={launchStatus}
          launchLabel={launchLabel}
          sortOrder={sortOrder}
          onSortChange={onSortChange}
          onToggleFavorite={onToggleFavorite}
          onLaunch={(id, game) => onLaunch(id, game ?? activeGame)}
          onEdit={onEdit}
          onRefreshSession={onRefreshSession}
          onDelete={onDelete}
        />
      )}
    </div>
  )
}
