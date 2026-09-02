import { AccountCard } from './AccountCard'
import { AccountListTable } from './AccountListTable'
import type { ViewMode } from '../../lib/types'

export interface RosterItem {
  id: string
  name: string
  region: string
  hasSession: boolean
  lastUsedText?: string | null
}

interface AccountRosterDisplayProps {
  items: RosterItem[]
  viewMode: ViewMode
  isCloud?: boolean
  canManage?: boolean
  busy?: boolean
  onLaunch: (id: string) => void
  onSync?: (id: string) => void
  onPushToCloud?: (id: string) => void
  onDelete: (id: string, name: string) => void
}

export function AccountRosterDisplay({
  items,
  viewMode,
  isCloud = false,
  canManage = false,
  busy = false,
  onLaunch,
  onSync,
  onPushToCloud,
  onDelete,
}: AccountRosterDisplayProps) {
  if (viewMode === 'grid') {
    return (
      <div className="roster-grid">
        {items.map((item) => (
          <AccountCard
            key={item.id}
            id={item.id}
            name={item.name}
            region={item.region}
            hasSession={item.hasSession}
            lastUsedText={item.lastUsedText}
            isCloud={isCloud}
            canManage={canManage}
            busy={busy}
            onLaunch={() => onLaunch(item.id)}
            onSync={onSync ? () => onSync(item.id) : undefined}
            onPushToCloud={onPushToCloud ? () => onPushToCloud(item.id) : undefined}
            onDelete={() => onDelete(item.id, item.name)}
          />
        ))}
      </div>
    )
  }

  return (
    <AccountListTable
      items={items}
      isCloud={isCloud}
      canManage={canManage}
      busy={busy}
      onLaunch={onLaunch}
      onSync={onSync}
      onPushToCloud={onPushToCloud}
      onDelete={onDelete}
    />
  )
}
