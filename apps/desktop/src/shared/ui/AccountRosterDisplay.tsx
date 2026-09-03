import { useEffect, useState } from 'react'
import { AccountCard } from './AccountCard'
import { AccountListTable } from './AccountListTable'
import { RosterOverviewRail } from './RosterOverviewRail'
import type { ViewMode } from '../../lib/types'

export interface RosterItem {
  id: string
  name: string
  region: string
  hasSession: boolean
  lastUsedText?: string | null
  status?: string
}

export interface AccountRosterDisplayProps {
  items: RosterItem[]
  viewMode: ViewMode
  isCloud?: boolean
  canManage?: boolean
  busy?: boolean
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
  onLaunch,
  onSync,
  onPushToCloud,
  onForceRelease,
  onRevokeSession,
  onDelete,
}: AccountRosterDisplayProps) {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null)

  // Keep selected item valid when items change
  useEffect(() => {
    if (!selectedId && items.length > 0) {
      setSelectedId(items[0].id)
    } else if (selectedId && !items.some((i) => i.id === selectedId)) {
      setSelectedId(items[0]?.id ?? null)
    }
  }, [items, selectedId])

  const selectedItem = items.find((i) => i.id === selectedId) ?? items[0] ?? null
  const readyCount = items.filter((i) => i.hasSession && i.status !== 'Leased').length
  const leasedCount = items.filter((i) => i.status === 'Leased').length

  return (
    <div className="studio-viewport">
      <div className="studio-roster-stage">
        {viewMode === 'grid' ? (
          <div className="roster-grid">
            {items.map((item) => (
              <AccountCard
                key={item.id}
                id={item.id}
                name={item.name}
                region={item.region}
                hasSession={item.hasSession}
                lastUsedText={item.lastUsedText}
                status={item.status}
                isSelected={item.id === selectedId}
                isCloud={isCloud}
                canManage={canManage}
                busy={busy}
                onSelect={() => setSelectedId(item.id)}
                onLaunch={() => onLaunch(item.id)}
                onSync={onSync ? () => onSync(item.id) : undefined}
                onPushToCloud={onPushToCloud ? () => onPushToCloud(item.id) : undefined}
                onForceRelease={onForceRelease ? () => onForceRelease(item.id) : undefined}
                onRevokeSession={onRevokeSession ? () => onRevokeSession(item.id) : undefined}
                onDelete={() => onDelete(item.id, item.name)}
              />
            ))}
          </div>
        ) : (
          <AccountListTable
            items={items}
            selectedId={selectedId}
            isCloud={isCloud}
            canManage={canManage}
            busy={busy}
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

      <RosterOverviewRail
        selectedItem={selectedItem}
        totalCount={items.length}
        readyCount={readyCount}
        leasedCount={leasedCount}
        isCloud={isCloud}
        canManage={canManage}
        busy={busy}
        onLaunch={onLaunch}
        onSync={onSync}
        onForceRelease={onForceRelease}
        onRevokeSession={onRevokeSession}
      />
    </div>
  )
}
