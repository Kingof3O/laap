import { ProfileAvatar } from './ProfileAvatar'
import { RankCrest } from './RankPicker'
import { useEffect, useMemo, useState } from 'react'
import { AccountCard } from './AccountCard'
import { AccountListTable } from './AccountListTable'
import { Play, RotateCcw, Loader2, Pencil } from 'lucide-react'
import { getRankTierClass, formatRelativeTime } from '../../lib/sorting'
import type { ViewMode } from '../../lib/types'

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
  status?: string
}

export interface AccountRosterDisplayProps {
  items: RosterItem[]
  viewMode: ViewMode
  isCloud?: boolean
  canManage?: boolean
  busy?: boolean
  launchingId?: string | null
  failedLaunchId?: string | null
  launchLabel?: string
  onEdit?: (id: string) => void
  onRefreshSession?: (id: string) => void
  onLaunch: (id: string) => void
  onSync?: (id: string) => void
  onPushToCloud?: (id: string) => void
  onForceRelease?: (id: string) => void
  onRevokeSession?: (id: string) => void
  onDelete: (id: string, name: string) => void
}

export function AccountRosterDisplay({
  items,
  viewMode,
  isCloud = false,
  canManage = false,
  busy = false,
  launchingId,
  failedLaunchId,
  launchLabel,
  onEdit,
  onRefreshSession,
  onLaunch,
  onSync,
  onPushToCloud,
  onForceRelease,
  onRevokeSession,
  onDelete,
}: AccountRosterDisplayProps) {
  // Find the most recently played account by default
  const defaultHeroId = useMemo(() => {
    const itemsWithUsage = items.filter(
      (i) => i.rawLastUsed && Number.isFinite(Date.parse(i.rawLastUsed)),
    )
    if (itemsWithUsage.length > 0) {
      return (
        [...itemsWithUsage].sort(
          (a, b) => Date.parse(b.rawLastUsed!) - Date.parse(a.rawLastUsed!),
        )[0]?.id ??
        items[0]?.id ??
        null
      )
    }
    return items[0]?.id ?? null
  }, [items])

  const [selectedId, setSelectedId] = useState<string | null>(defaultHeroId)

  // Keep selected item valid when items change
  useEffect(() => {
    if (!selectedId && items.length > 0) {
      setSelectedId(defaultHeroId)
    } else if (selectedId && !items.some((i) => i.id === selectedId)) {
      setSelectedId(defaultHeroId)
    }
  }, [items, selectedId, defaultHeroId])

  const activeHero = items.find((i) => i.id === selectedId) ?? items[0] ?? null
  const isMostRecent =
    activeHero?.id === defaultHeroId && Boolean(activeHero?.rawLastUsed)

  return (
    <div className="studio-viewport">
      {/* Hero Quick-Resume Strip (Layout A) */}
      {!isCloud && activeHero ? (
        <div className="hero-resume-strip">
          <div className="hero-resume-left">
            <div className="hero-avatar">
              <ProfileAvatar
                name={activeHero.name}
                asset={activeHero.iconAsset}
              />
              <span className="hero-region-badge">{activeHero.region}</span>
            </div>

            <div className="hero-info">
              <div className="hero-label-row">
                <span className="hero-badge-title">
                  {isMostRecent ? 'Most Recently Played' : 'Selected Summoner'}
                </span>
                <span className="hero-dot">•</span>
                <span className="hero-timestamp">
                  {formatRelativeTime(
                    activeHero.rawLastUsed || activeHero.lastUsedText,
                  )}
                </span>
              </div>

              <h2 className="hero-name" title={activeHero.name}>
                {activeHero.name}
              </h2>

              <div className="hero-meta-row">
                {activeHero.rank ? (
                  <span
                    className={`account-rank-label ${getRankTierClass(activeHero.rank)}`}
                    title={`Rank: ${activeHero.rank}`}
                  >
                    <RankCrest rank={activeHero.rank} /> {activeHero.rank}
                  </span>
                ) : null}

                <span
                  className={`status-indicator ${
                    activeHero.hasSession &&
                    activeHero.status !== 'Session stale' && !activeHero.status?.includes('unknown')
                      ? 'status-indicator-ready'
                      : 'status-indicator-warn'
                  }`}
                >
                  <span
                    className={`status-beacon ${
                      activeHero.hasSession &&
                      activeHero.status !== 'Session stale' && !activeHero.status?.includes('unknown')
                        ? 'status-beacon-ready'
                        : 'status-beacon-amber'
                    }`}
                  />
                  {activeHero.hasSession
                    ? activeHero.status || 'Session Ready'
                    : 'Sign in required'}
                </span>
              </div>
              {activeHero.notes ? (
                <p className="account-notes hero-notes">{activeHero.notes}</p>
              ) : null}
            </div>
          </div>

          <div className="hero-actions">
            {onEdit ? (
              <button
                type="button"
                className="action-icon-btn"
                style={{ width: '40px', height: '40px', borderRadius: '8px' }}
                title="Edit Profile"
                aria-label={`Edit ${activeHero.name}`}
                disabled={busy}
                onClick={() => onEdit(activeHero.id)}
              >
                <Pencil size={16} />
              </button>
            ) : null}

            {activeHero.id === launchingId ? (
              <button type="button" className="btn-hero-play" disabled>
                <Loader2 size={16} className="animate-spin" />
                <span>Preparing…</span>
              </button>
            ) : activeHero.id === failedLaunchId ? (
              <button
                type="button"
                className="btn-hero-play"
                style={{
                  background: 'rgba(239, 68, 68, 0.25)',
                  borderColor: 'rgba(239, 68, 68, 0.5)',
                  color: '#fca5a5',
                }}
                onClick={() => onLaunch(activeHero.id)}
                disabled={busy}
              >
                <RotateCcw size={15} />
                <span>Retry Launch</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn-hero-play"
                onClick={() =>
                  !activeHero.hasSession && onRefreshSession
                    ? onRefreshSession(activeHero.id)
                    : onLaunch(activeHero.id)
                }
                disabled={busy}
              >
                <Play size={15} fill="currentColor" />
                <span>
                  {!activeHero.hasSession && onRefreshSession
                    ? 'Sign in again'
                    : isMostRecent
                      ? 'Resume Game'
                      : launchLabel || 'Play Game'}
                </span>
              </button>
            )}
          </div>
        </div>
      ) : null}

      <div className="studio-roster-stage">
        {viewMode === 'grid' ? (
          <div className="roster-grid">
            {items.map((item) => (
              <AccountCard
                key={item.id}
                id={item.id}
                name={item.name}
                region={item.region}
                rank={item.rank}
                notes={item.notes}
                iconAsset={item.iconAsset}
                hasSession={item.hasSession}
                lastUsedText={item.rawLastUsed || item.lastUsedText}
                status={item.status}
                isSelected={item.id === selectedId}
                isCloud={isCloud}
                canManage={canManage}
                busy={busy}
                isLaunching={item.id === launchingId}
                launchFailed={item.id === failedLaunchId}
                launchLabel={launchLabel}
                onEdit={onEdit ? () => onEdit(item.id) : undefined}
                onRefreshSession={
                  onRefreshSession ? () => onRefreshSession(item.id) : undefined
                }
                onRetry={() => onLaunch(item.id)}
                onSelect={() => setSelectedId(item.id)}
                onLaunch={() => onLaunch(item.id)}
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
              />
            ))}
          </div>
        ) : (
          <AccountListTable
            items={items.map((i) => ({
              ...i,
              lastUsedText: i.rawLastUsed || i.lastUsedText,
            }))}
            selectedId={selectedId}
            isCloud={isCloud}
            canManage={canManage}
            busy={busy}
            launchingId={launchingId}
            failedLaunchId={failedLaunchId}
            launchLabel={launchLabel}
            onEdit={onEdit}
            onRefreshSession={onRefreshSession}
            onSelect={setSelectedId}
            onLaunch={onLaunch}
            onSync={onSync}
            onPushToCloud={onPushToCloud}
            onForceRelease={onForceRelease}
            onRevokeSession={onRevokeSession}
            onDelete={onDelete}
          />
        )}
      </div>
    </div>
  )
}
