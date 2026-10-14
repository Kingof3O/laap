export function AccountLoadState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean
  error: unknown
  onRetry: () => void
}) {
  if (loading)
    return (
      <div className="empty-state-card" role="status">
        <span className="loading-spinner animate-spin" /> Loading profiles…
      </div>
    )
  const message = error instanceof Error ? error.message : String(error ?? '')
  const friendly = /keychain|credential|vault key/i.test(message)
    ? 'Your local vault could not be unlocked. Unlock your OS keychain and retry.'
    : message
  return (
    <div className="empty-state-card" role="alert">
      <h3>Unable to load profiles</h3>
      <p>{friendly}</p>
      <button className="btn-modal-primary" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}
