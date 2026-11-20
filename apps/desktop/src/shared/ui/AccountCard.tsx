import { ProfileAvatar } from './ProfileAvatar'
import { RankCrest } from './RankPicker'
import { ContextMenu, type MenuItem } from './ContextMenu'
import {
  Activity,
  KeyRound,
  Loader2,
  LogIn,
  Pencil,
  Play,
  RotateCcw,
  Star,
  Trash2,
  UploadCloud,
  Zap,
} from 'lucide-react'
import { getRankTierClass } from '../../lib/sorting'
import { formatLiveMatchLabel, formatLiveMinutes } from '../../lib/liveStatus'
import type { Game, LiveStatusBadge } from '../../lib/types'

export interface AccountCardProps {
  id: string
  name: string
  region: string
  rank?: string | null
  valorantRank?: string | null
  games?: Game[]
  activeGame?: Game
  riotId?: string | null
  notes?: string | null
  iconAsset?: string | null
  lastUsedText?: string | null
  hasSession?: boolean
  status?: string
  isSelected?: boolean
  isFavorite?: boolean
  isRecent?: boolean
  isCloud?: boolean
  canManage?: boolean
  busy?: boolean
  clientRunning?: boolean
  launchStatus?: string | null
  isLaunching?: boolean
  launchFailed?: boolean
  launchLabel?: string
  onSelect?: () => void
  onEdit?: () => void
  onRefreshSession?: () => void
  onLaunch: (game?: Game) => void
  onRetry?: (game?: Game) => void
  onSync?: () => void
  onPushToCloud?: () => void
  onForceRelease?: () => void
  onRevokeSession?: () => void
  onDelete: () => void
  onToggleFavorite?: () => void
  onCheckLive?: () => void
  showLiveMenuAction?: boolean
  liveStatus?: LiveStatusBadge | null
}

export function AccountCard({
  name,
  region,
  rank,
  valorantRank,
  games,
  activeGame = 'league',
  riotId,
  notes,
  iconAsset,
  lastUsedText,
  hasSession = true,
  status = 'Available',
  isSelected = false,
  isFavorite = false,
  isRecent = false,
  isCloud = false,
  canManage = false,
  busy = false,
  clientRunning = false,
  launchStatus,
  isLaunching = false,
  launchFailed = false,
  launchLabel = 'Play',
  onSelect,
  onEdit,
  onRefreshSession,
  onLaunch,
  onRetry,
  onSync,
  onPushToCloud,
  onForceRelease,
  onRevokeSession,
  onDelete,
  onToggleFavorite,
  onCheckLive,
  showLiveMenuAction = false,
  liveStatus,
}: AccountCardProps) {
  const isLeased = isCloud && status === 'Leased'
  const isStale = !isCloud && (status === 'Session stale' || status.includes('unknown'))
  const needsSignIn = !hasSession || status === 'Sign in required'
  const displayRank = activeGame === 'valorant' ? (valorantRank !== undefined ? valorantRank : rank) : rank
  const supportedGames = games && games.length > 0 ? games : ['league']

  // Context menu actions for secondary capabilities
  const menuItems: MenuItem[] = []

  if (onCheckLive && showLiveMenuAction) {
    menuItems.push({
      id: 'check-live',
      label: 'Check Live Match',
      icon: <Activity size={14} />,
      onClick: onCheckLive,
    })
  }

  if (onRefreshSession) {
    menuItems.push({
      id: 'refresh',
      label: 'Refresh Login',
      icon: <KeyRound size={14} />,
      onClick: onRefreshSession,
    })
  }

  if (onSync && (!isCloud || canManage)) {
    menuItems.push({
      id: 'sync',
      label: isCloud ? 'Sync Session' : 'Sync Icon & Rank',
      icon: <RotateCcw size={14} />,
      onClick: onSync,
    })
  }

  if (onPushToCloud) {
    menuItems.push({
      id: 'push',
      label: 'Publish to Shared Accounts',
      icon: <UploadCloud size={14} />,
      onClick: onPushToCloud,
    })
  }

  if (onForceRelease && canManage && isLeased) {
    menuItems.push({
      id: 'force-release',
      label: 'Force Release Lease',
      icon: <Zap size={14} />,
      danger: true,
      onClick: onForceRelease,
    })
  }

  if (onRevokeSession && canManage && hasSession) {
    menuItems.push({
      id: 'revoke',
      label: 'Revoke Cloud Session',
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: onRevokeSession,
    })
  }

  if (!isCloud || canManage) {
    menuItems.push({
      id: 'delete',
      label: isCloud ? 'Delete Account' : 'Remove Profile',
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: onDelete,
    })
  }

  const handlePrimaryAction = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isLeased) {
      if (canManage && onForceRelease) onForceRelease()
    } else if (launchFailed && onRetry) {
      onRetry(activeGame)
    } else if (!hasSession && onRefreshSession) {
      onRefreshSession()
    } else {
      onLaunch(activeGame)
    }
  }

  // Determine button contents and state according to precise desktop process conditions
  let buttonContent: React.ReactNode = null
  let buttonDisabled = busy || (isCloud && isLeased && !(canManage && onForceRelease))

  if (isLeased) {
    if (canManage && onForceRelease) {
      buttonContent = (
        <>
          <RotateCcw size={13} />
          <span>Force Release</span>
        </>
      )
    } else {
      buttonContent = <span>In Use</span>
    }
  } else if (isLaunching) {
    buttonDisabled = true
    buttonContent = (
      <span className="btn-launch-loading-content">
        <Loader2 size={12} className="animate-spin" />
        <span>{launchStatus ? 'Waiting for client…' : 'Preparing…'}</span>
      </span>
    )
  } else if (clientRunning) {
    buttonDisabled = true
    buttonContent = <span>Client running</span>
  } else if (launchFailed) {
    buttonContent = (
      <>
        <RotateCcw size={13} />
        <span>Couldn&apos;t launch · Retry</span>
      </>
    )
  } else if (!hasSession && onRefreshSession) {
    buttonContent = (
      <>
        <LogIn size={13} />
        <span>Sign in again</span>
      </>
    )
  } else {
    buttonContent = (
      <>
        <Play size={13} fill="currentColor" />
        <span>{launchLabel}</span>
      </>
    )
  }

  const displayName = name

  return (
    <div
      className={`roster-card ${isSelected ? 'roster-card-selected' : ''}`}
      onClick={() => onSelect?.()}
    >
      {/* Top Row: Avatar + Identity + Actions */}
      <div className="card-top-row">
        <div className="card-identity">
          <div className="card-avatar">
            <ProfileAvatar
              name={displayName}
              asset={iconAsset}
              activeGame={activeGame}
              riotId={riotId}
              region={region}
            />
            <span className="card-region-badge">{region}</span>
          </div>

          <div className="card-info">
            <div className="card-name-row">
              <button type="button" className="card-name" title={name} aria-label={`Select ${name}`} aria-pressed={isSelected} onClick={(event) => { event.stopPropagation(); onSelect?.() }}>
                {name}
              </button>
              {isRecent ? (
                <span className="card-recent-badge">Recent</span>
              ) : null}
              {supportedGames.length > 0 && (
                <div className="card-game-badges" aria-label="Supported games">
                  {supportedGames.includes('league') && (
                    <span className="game-badge game-badge-league" title="Supports League">
                      <img src="/league-of-legends-icon.webp" alt="" className="game-badge-icon" aria-hidden="true" />
                      LEAGUE
                    </span>
                  )}
                  {supportedGames.includes('valorant') && (
                    <span className="game-badge game-badge-valo" title="Supports VALORANT">
                      <img src="/valorant-icon.webp" alt="" className="game-badge-icon" aria-hidden="true" />
                      VALO
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="card-meta-row">
              {displayRank ? (
                <span
                  className={`account-rank-label ${getRankTierClass(displayRank)}`}
                  title={`Rank: ${displayRank}`}
                >
                  {activeGame === 'valorant' ? (
                    <img
                      src="/valorant-icon.webp"
                      alt=""
                      className="game-badge-icon"
                      aria-hidden="true"
                    />
                  ) : (
                    <RankCrest rank={displayRank} />
                  )}{' '}
                  {displayRank}
                </span>
              ) : null}

              {isLeased ? (
                <span className="card-status-pill card-status-warn">
                  In Use
                </span>
              ) : needsSignIn ? (
                <span className="card-status-pill card-status-warn">
                  Sign In Required
                </span>
              ) : isStale ? (
                <span className="card-status-pill card-status-warn">
                  {status}
                </span>
              ) : (
                <span className="card-status-pill card-status-ready">
                  {isCloud ? 'Available' : 'Login Saved'}
                </span>
              )}

              {liveStatus?.checking ? (
                <span className="card-status-pill card-status-idle">
                  Checking live…
                </span>
              ) : liveStatus?.inGame ? (
                <span
                  className="card-status-pill card-status-ingame"
                  title={formatLiveMatchLabel(liveStatus)}
                >
                  <Activity size={11} />
                  {(() => {
                    const mins = formatLiveMinutes(liveStatus.gameLengthSeconds)
                    return mins !== null ? `In Match · ${mins}m` : 'In Match'
                  })()}
                </span>
              ) : liveStatus?.inGame === false ? (
                <span
                  className="card-status-pill card-status-idle"
                  title={formatLiveMatchLabel(liveStatus)}
                >
                  Not in game
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {onToggleFavorite || isFavorite ? (
          <button
            type="button"
            className={`card-favorite-btn ${isFavorite ? 'card-favorite-btn-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite?.()
            }}
            title={isFavorite ? 'Favorited' : 'Favorite profile'}
            aria-label={isFavorite ? 'Favorited profile' : 'Add to favorites'}
          >
            <Star size={15} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        ) : null}
      </div>

      {notes ? <p className="account-notes card-notes">{notes}</p> : null}

      {/* Bottom Row: Metadata + Launch / Edit / More Actions */}
      <div className="card-bottom-row">
        <span className="last-played-text">
          {lastUsedText ? `Last played: ${lastUsedText}` : 'Never launched'}
        </span>

        <div className="card-actions-group">
          {onEdit ? (
            <button
              type="button"
              className="btn-card-action"
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
              disabled={busy}
              title="Edit Profile"
              aria-label={`Edit ${name}`}
            >
              <Pencil size={13} />
            </button>
          ) : null}

          {menuItems.length > 0 ? (
            <ContextMenu items={menuItems} label={`Options for ${displayName}`} />
          ) : null}

          <button
            type="button"
            className={`btn-launch-primary ${isLaunching ? 'btn-launch-loading' : ''}`}
            disabled={buttonDisabled}
            onClick={handlePrimaryAction}
          >
            {buttonContent}
          </button>
        </div>
      </div>
    </div>
  )
}
