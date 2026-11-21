import { RefreshCw } from 'lucide-react'

export function SyncStatusWidget({
  syncEnabled,
  syncState,
  syncMessage,
  lastSyncAt,
  lastSuccessfulSyncAt,
  blocked,
  onSyncNow,
}: {
  syncEnabled: boolean
  syncState: string
  syncMessage?: string | null
  lastSyncAt?: Date | null
  lastSuccessfulSyncAt?: Date | null
  blocked: boolean
  onSyncNow: () => void | Promise<void>
}) {
  if (!syncEnabled) return null

  return (
    <details className={`sync-compact sync-status-${syncState}`}>
      <summary>
        <RefreshCw size={15} /> <span>Icon &amp; rank sync</span>
        <span className="sync-compact-state">
          {syncState === 'syncing'
            ? 'Syncing…'
            : syncState === 'error'
              ? 'Needs attention'
              : syncState === 'waiting'
                ? 'Waiting'
                : syncState === 'success'
                  ? 'Up to date'
                  : 'Enabled'}
        </span>
      </summary>
      <div className="sync-compact-panel">
        <p role="status">
          {syncMessage ?? 'Checks enabled profile options when League Client is available.'}
        </p>
        {lastSyncAt ? (
          <small>
            Last checked: {lastSyncAt.toLocaleTimeString()}
            {lastSuccessfulSyncAt
              ? ` · Last successful: ${lastSuccessfulSyncAt.toLocaleTimeString()}`
              : ''}
          </small>
        ) : null}
        <button
          type="button"
          className="btn-secondary"
          disabled={syncState === 'syncing' || blocked}
          onClick={() => void onSyncNow()}
        >
          {syncState === 'syncing'
            ? 'Syncing…'
            : syncState === 'error'
              ? 'Retry sync'
              : 'Sync now'}
        </button>
      </div>
    </details>
  )
}
