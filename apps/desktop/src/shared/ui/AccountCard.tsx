import { ProfileAvatar } from './ProfileAvatar'
import { RankCrest } from './RankPicker'
import { SeasonRecord } from './SeasonRecord'
import { ContextMenu, type MenuItem } from './ContextMenu'
import {
  Activity,
  CheckCircle2,
  Clock3,
  KeyRound,
  Loader2,
  LogIn,
  Pencil,
  Play,
  RotateCcw,
  Star,
  Trash2,
} from 'lucide-react'
import { getRankTierClass } from '../../lib/sorting'
import { formatLiveMatchLabel, formatLiveMinutes } from '../../lib/liveStatus'
import { formatLastPlayed } from '../../lib/lastPlayed'
import type { Game, LiveStatusBadge } from '../../lib/types'
import type { OpggStats } from '../../lib/opgg'

export interface AccountCardProps {
  id: string
  name: string
  region: string
  rank?: string | null
  seasonStats?: Pick<OpggStats, 'wins' | 'losses'> | null
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
  seasonStats,
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
  onDelete,
  onToggleFavorite,
  onCheckLive,
  showLiveMenuAction = false,
  liveStatus,
}: AccountCardProps) {
  const isStale = (status === 'Session stale' || status.includes('unknown'))
  const needsSignIn = !hasSession || status === 'Sign in required'
  const targetRiotId = riotId ?? (name.includes('#') ? name : null)
  const displayRank = activeGame === 'valorant' ? valorantRank : rank
  const supportedGames = games && games.length > 0 ? games : ['league']
  const regionAlreadyInName = name.toLocaleLowerCase().includes(region.toLocaleLowerCase())
  const lastPlayedLabel = formatLastPlayed(lastUsedText)

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

  if (onSync) {
    menuItems.push({
      id: 'sync',
      label: 'Sync Icon & Rank',
      icon: <RotateCcw size={14} />,
      onClick: onSync,
    })
  }

  menuItems.push({
    id: 'delete',
    label: 'Remove Profile',
    icon: <Trash2 size={14} />,
    danger: true,
    onClick: onDelete,
  })

  const handlePrimaryAction = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (launchFailed && onRetry) {
      onRetry(activeGame)
    } else if (!hasSession && onRefreshSession) {
      onRefreshSession()
    } else {
      onLaunch(activeGame)
    }
  }

  let buttonContent: React.ReactNode
  let buttonDisabled = busy

  if (isLaunching) {
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
      {/* Identity is the hero. Game support and session readiness sit below it. */}
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
          </div>
          <div className="card-info">
            <div className="card-name-row">
              <button
                type="button"
                className="card-name"
                title={name}
                aria-label={`Select ${name}`}
                aria-pressed={isSelected}
                onClick={(event) => { event.stopPropagation(); onSelect?.() }}
              >
                {name}
              </button>
              {isRecent ? <span className="card-recent-badge">Recent</span> : null}
            </div>
            <div className="card-identity-subtitle">
              {!regionAlreadyInName ? <span className="card-region-text">{region}</span> : null}
              <span className="card-game-context">
                <img
                  src={activeGame === 'valorant' ? '/valorant-icon.webp' : '/league-of-legends-icon.webp'}
                  alt=""
                  aria-hidden="true"
                  width={14}
                  height={14}
                  className="card-game-icon"
                />
                {activeGame === 'valorant' ? 'VALORANT' : 'League of Legends'}
              </span>
            </div>
          </div>
        </div>
        <div className="card-top-actions">
          {supportedGames.length > 1 ? (
            <div className="card-game-badges" aria-label="Supported games">
              {supportedGames.includes('league') ? (
                <span className="game-badge game-badge-league" title="Supports League of Legends">
                  <img src="/league-of-legends-icon.webp" alt="" aria-hidden="true" className="game-badge-icon" />
                  <span className="visually-hidden">League of Legends</span>
                </span>
              ) : null}
              {supportedGames.includes('valorant') ? (
                <span className="game-badge game-badge-valo" title="Supports VALORANT">
                  <img src="/valorant-icon.webp" alt="" aria-hidden="true" className="game-badge-icon" />
                  <span className="visually-hidden">VALORANT</span>
                </span>
              ) : null}
            </div>
          ) : null}
          {onToggleFavorite || isFavorite ? (
            <button
              type="button"
              className={`card-favorite-btn ${isFavorite ? 'card-favorite-btn-active' : ''}`}
              onClick={(event) => { event.stopPropagation(); onToggleFavorite?.() }}
              title={isFavorite ? 'Favorited' : 'Favorite profile'}
              aria-label={isFavorite ? 'Favorited profile' : 'Add to favorites'}
              aria-pressed={isFavorite}
            >
              <Star size={16} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="card-details-row">
        <div className="card-rank" title={displayRank ? `Rank: ${displayRank}` : 'Rank not set'}>
          <span className={`card-rank-emblem ${getRankTierClass(displayRank ?? '')}`}>
            <RankCrest rank={displayRank || 'Unranked'} game={activeGame} />
          </span>
          <span className="card-rank-copy">
            <span className="card-rank-caption">Rank</span>
            <span className="card-rank-value">{displayRank || 'Unranked'}</span>
          </span>
        </div>
        {needsSignIn ? (
          <span className="card-status-pill card-status-warn">Sign in required</span>
        ) : isStale ? (
          <span className="card-status-pill card-status-warn" title={status}>Session needs attention</span>
        ) : (
          <span className="card-status-pill card-status-ready">
            <CheckCircle2 size={13} aria-hidden="true" />
            Login saved
          </span>
        )}
      </div>
      {seasonStats ? <SeasonRecord wins={seasonStats.wins} losses={seasonStats.losses} /> : null}
      {liveStatus?.checking ? (
        <div className="card-live-row">
          <span className="card-status-pill card-status-idle">Checking live match…</span>
        </div>
      ) : liveStatus?.inGame ? (
        <div className="card-live-row">
          <span className="card-status-pill card-status-ingame" title={formatLiveMatchLabel(liveStatus)}>
            <Activity size={13} aria-hidden="true" />
            {(() => {
              const mins = formatLiveMinutes(liveStatus.gameLengthSeconds)
              return mins !== null ? `In Match · ${mins}m` : 'In Match'
            })()}
          </span>
        </div>
      ) : null}

      {notes ? <p className="account-notes card-notes">{notes}</p> : null}

      {/* Secondary actions are visually quiet; launching remains the only CTA. */}
      <div className="card-bottom-row">
        <span className="last-played-text" title={lastUsedText ? `Last played: ${lastUsedText}` : 'Never launched'}>
          <Clock3 size={13} aria-hidden="true" />
          <span>{lastPlayedLabel === 'Never' ? 'Never launched' : lastPlayedLabel}</span>
        </span>
        <div className="card-actions-group">
          {onEdit ? (
            <button
              type="button"
              className="btn-card-action"
              onClick={(event) => { event.stopPropagation(); onEdit() }}
              disabled={busy}
              title="Edit Profile"
              aria-label={`Edit ${name}`}
            >
              <Pencil size={14} />
            </button>
          ) : null}
          {menuItems.length > 0 ? <ContextMenu items={menuItems} label={`Options for ${displayName}`} /> : null}
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
