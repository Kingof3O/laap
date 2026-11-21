import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { CheckCircle2, Pencil, Settings2, X } from 'lucide-react'
import type { RosterItem } from '../AccountRosterDisplay.tsx'
import type { Game } from '../../../lib/types.ts'
import type { OpggStats } from '../../../lib/opgg.ts'
import { ProfileAvatar } from '../ProfileAvatar.tsx'
import { InspectorIconButton } from './InspectorIconButton.tsx'
import { isStreamerModeEnabled, maskAccountName, maskRiotId } from '../../../lib/streamerMode.ts'

export function InspectorIdentityHeader({
  account,
  name,
  region,
  riotId,
  riotTag,
  activeGame,
  isVal,
  level,
  stats,
  sessionStatus,
  sessionReady,
  busy,
  actions,
  onEdit,
  onClose,
  onEditRiotId,
}: {
  account: RosterItem
  name: string
  region: string
  riotId?: string | null
  riotTag: string | null
  activeGame: Game
  isVal: boolean
  level?: number
  stats: OpggStats | null
  sessionStatus: string
  sessionReady: boolean
  busy?: boolean
  actions?: ReactNode
  onEdit?: () => void
  onClose: () => void
  onEditRiotId?: () => void
}) {
  const [streamerMode, setStreamerMode] = useState(isStreamerModeEnabled())
  useEffect(() => {
    const handler = (e: Event) => setStreamerMode((e as CustomEvent<boolean>).detail)
    window.addEventListener('laap:streamer-mode-changed', handler)
    return () => window.removeEventListener('laap:streamer-mode-changed', handler)
  }, [])

  const displayName = streamerMode ? maskAccountName(name) : name
  const displayRiotTag = streamerMode ? maskRiotId(riotTag) : riotTag

  return (
    <>
      <header className="inspector-top">
        <h2>Account details</h2>
        <div className="inspector-icon-group">
          {actions}
          {onEdit ? (
            <InspectorIconButton label="Manage profile" onClick={onEdit} disabled={busy}>
              <Settings2 size={15} />
            </InspectorIconButton>
          ) : null}
          <InspectorIconButton label="Hide account details" onClick={onClose}>
            <X size={17} />
          </InspectorIconButton>
        </div>
      </header>

      <div className="inspector-profile">
        <div className="inspector-avatar-wrapper">
          <div className="inspector-avatar">
            <ProfileAvatar
              name={displayName}
              asset={stats?.avatarUrl || account.iconAsset}
              activeGame={activeGame}
              avatarUrl={stats?.avatarUrl}
              riotId={riotId}
              region={region}
            />
          </div>
          {typeof level === 'number' ? (
            <span className="inspector-avatar-level" title={`Account level ${level}`}>
              {level}
            </span>
          ) : null}
        </div>

        <div className="inspector-identity-copy">
          <strong title={streamerMode ? 'Protected in Streamer Mode' : name}>{displayName}</strong>

          {displayRiotTag ? (
            <div className="inspector-riot-id">
              <span className="inspector-riot-id-tag" title={displayRiotTag}>
                {displayRiotTag}
              </span>
              {onEditRiotId ? (
                <InspectorIconButton
                  label="Edit linked Riot ID"
                  title="Edit linked Riot ID"
                  onClick={onEditRiotId}
                >
                  <Pencil size={11} />
                </InspectorIconButton>
              ) : null}
            </div>
          ) : null}

          <div className="inspector-subtitle">
            <span className="inspector-region-pill">{region}</span>
            <span className={`game-badge ${isVal ? 'game-badge-valo' : 'game-badge-league'}`}>
              <img
                src={isVal ? '/valorant-icon.webp' : '/league-of-legends-icon.webp'}
                alt=""
                className="game-badge-icon"
              />
              {isVal ? 'VALORANT' : 'League'}
            </span>
            <span
              className={`inspector-session-pill ${sessionReady ? 'inspector-session-ready' : 'inspector-session-warn'}`}
              title={
                sessionReady
                  ? 'Encrypted in Windows DPAPI Credential Manager · Local session valid'
                  : 'Session needs refresh · Launch will prompt Riot Sign-In'
              }
            >
              <CheckCircle2 size={11} aria-hidden="true" />
              <span>{sessionStatus}</span>
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
