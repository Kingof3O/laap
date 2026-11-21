import { AlertCircle, RefreshCw } from 'lucide-react'
import { RosterWorkspaceSkeleton } from './skeleton/index.ts'

export function AccountLoadState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean
  error: unknown
  onRetry: () => void
}) {
  if (loading) {
    return <RosterWorkspaceSkeleton />
  }

  const message = error instanceof Error ? error.message : String(error ?? '')
  const friendly = /keychain|credential|vault key/i.test(message)
    ? 'Your local vault could not be unlocked. Unlock your OS keychain and retry.'
    : message

  return (
    <div className="empty-state-card error-state-card" role="alert">
      <div className="error-state-header">
        <AlertCircle size={22} className="error-state-icon" aria-hidden="true" />
        <h3 className="error-state-title">Unable to load profiles</h3>
      </div>
      <p className="error-state-message">{friendly}</p>
      <button type="button" className="btn-modal-primary" onClick={onRetry}>
        <RefreshCw size={14} style={{ marginRight: '6px' }} />
        <span>Retry</span>
      </button>
    </div>
  )
}
