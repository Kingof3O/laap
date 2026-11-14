import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { AccountCard } from './AccountCard'
import { AccountListTable } from './AccountListTable'
import type { ViewMode } from '../../lib/types'
import { PanelRightOpen } from 'lucide-react'
import { ProfileInspector } from './ProfileInspector'

export interface RosterItem {
  id: string
  name: string
  region: string
  rank?: string | null
  notes?: string
  iconAsset?: string | null
  hasSession: boolean
  lastUsedText?: string | null
  rawLastUsed?: string | null
  createdAt?: string | null
  status?: string
  favorite?: boolean
}

export interface AccountRosterDisplayProps {
  items: RosterItem[]
  viewMode: ViewMode
  isCloud?: boolean
  canManage?: boolean
  busy?: boolean
  launchingId?: string | null
  failedLaunchId?: string | null
  activeLaunchId?: string | null
  launchStatus?: string | null
  launchLabel?: string
  onEdit?: (id: string) => void
  onRefreshSession?: (id: string) => void
  onLaunch: (id: string) => void
  onSync?: (id: string) => void
  profileActions?: (account: RosterItem) => ReactNode
  toolbarSlot?: ReactNode
  onPushToCloud?: (id: string) => void
  onForceRelease?: (id: string) => void
  onRevokeSession?: (id: string) => void
  onDelete: (id: string, name: string) => void
  onToggleFavorite?: (id: string) => void
}

export function AccountRosterDisplay({
  items,
  viewMode,
  isCloud = false,
  canManage = false,
  busy = false,
  launchingId,
  failedLaunchId,
  activeLaunchId,
  launchStatus,
  launchLabel,
  onEdit,
  onRefreshSession,
  onLaunch,
  onSync,
  onPushToCloud,
  profileActions,
  toolbarSlot,
  onForceRelease,
  onRevokeSession,
  onDelete,
  onToggleFavorite,
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

  // Determine appropriate grid container class based on account count (PART 3)
  const gridLayoutClass = useMemo(() => {
    if (items.length === 1) return 'roster-grid roster-grid-single'
    if (items.length === 2) return 'roster-grid roster-grid-double'
    return 'roster-grid'
  }, [items.length])

  const activeHero = items.find((i) => i.id === selectedId) ?? items[0] ?? null

  return (
    <div className="studio-viewport">
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
              {isCloud ? 'SHARED ACCOUNTS' : 'YOUR ACCOUNTS'}
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
        <div className={gridLayoutClass} role="region" aria-label="Account Roster">
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
                notes={item.notes}
                iconAsset={item.iconAsset}
                lastUsedText={item.lastUsedText}
                hasSession={item.hasSession}
                status={item.status}
                isSelected={isSelected}
                isFavorite={item.favorite}
                isRecent={isRecent}
                isCloud={isCloud}
                canManage={canManage}
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
                onLaunch={() => onLaunch(item.id)}
                onRetry={() => onLaunch(item.id)}
                onSync={onSync ? () => onSync(item.id) : undefined}
                onPushToCloud={
                  onPushToCloud ? () => onPushToCloud(item.id) : undefined
                }
                onForceRelease={
                  onForceRelease ? () => onForceRelease(item.id) : undefined
                }
                onRevokeSession={
                  onRevokeSession ? () => onRevokeSession(item.id) : undefined
                }
                onDelete={() => onDelete(item.id, item.name)}
                onToggleFavorite={
                  onToggleFavorite ? () => onToggleFavorite(item.id) : undefined
                }
              />
            )
          })}
        </div>
        {detailsOpen && activeHero ? (
          <ProfileInspector
            account={activeHero}
            busy={busy || launchingId === activeHero.id}
            onClose={() => toggleDetails(false)}
            onEdit={onEdit ? () => onEdit(activeHero.id) : undefined}
            onLaunch={() => onLaunch(activeHero.id)}
            launchLabel={launchLabel}
            actions={profileActions?.(activeHero)}
          />
        ) : null}
        </div>
      ) : (
        <AccountListTable
          items={items}
          isCloud={isCloud}
          canManage={canManage}
          busy={busy}
          launchingId={launchingId}
          failedLaunchId={failedLaunchId}
          activeLaunchId={activeLaunchId}
          launchStatus={launchStatus}
          launchLabel={launchLabel}
          onLaunch={onLaunch}
          onEdit={onEdit}
          onRefreshSession={onRefreshSession}
          onSync={onSync}
          onPushToCloud={onPushToCloud}
          onForceRelease={onForceRelease}
          onRevokeSession={onRevokeSession}
          onDelete={onDelete}
        />
      )}
    </div>
  )
}
