import type { ReactNode } from 'react'
import { Settings2, X } from 'lucide-react'
import type { RosterItem } from '../AccountRosterDisplay.tsx'
import type { Game } from '../../../lib/types.ts'
import type { OpggStats } from '../../../lib/opgg.ts'
import { ProfileAvatar } from '../ProfileAvatar.tsx'
import { InspectorIconButton } from './InspectorIconButton.tsx'

export function InspectorIdentityHeader({
  account,
  name,
  region,
  riotId,
  activeGame,
  stats,
  sessionStatus,
  busy,
  actions,
  onEdit,
  onClose,
}: {
  account: RosterItem
  name: string
  region: string
  riotId?: string | null
  activeGame: Game
  stats: OpggStats | null
  sessionStatus: string
  busy?: boolean
  actions?: ReactNode
  onEdit?: () => void
  onClose: () => void
}) {
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
        <div className="inspector-avatar">
          <ProfileAvatar
            name={name}
            asset={stats?.avatarUrl || account.iconAsset}
            activeGame={activeGame}
            avatarUrl={stats?.avatarUrl}
            riotId={riotId}
            region={region}
          />
        </div>
        <div>
          <strong>{name}</strong>
          <span className="inspector-region">{region}</span>
          <span className="inspector-status">{sessionStatus}</span>
        </div>
      </div>
    </>
  )
}
