export function LoadState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  if (loading)
    return (
      <p className="my-6 text-sm text-slate-400" role="status">
        Loading workspace data…
      </p>
    )
  if (!error) return null
  return (
    <div
      className="my-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-slate-200"
      role="alert"
    >
      <p>{error}</p>
      <button
        className="mt-3 rounded-lg border border-white/20 px-3 py-2"
        onClick={onRetry}
      >
        Retry
      </button>
    </div>
  )
}
