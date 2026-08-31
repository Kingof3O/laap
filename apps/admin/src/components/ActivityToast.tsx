import { CheckCircle2, X } from 'lucide-react'
import { useEffect } from 'react'

export function ActivityToast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  useEffect(() => { if (!message) return; const timeout = window.setTimeout(onDismiss, 3600); return () => window.clearTimeout(timeout) }, [message, onDismiss])
  if (!message) return null
  return <div className="fixed bottom-5 left-1/2 z-50 flex w-[calc(100%-32px)] max-w-sm -translate-x-1/2 items-center gap-3 rounded-2xl border border-emerald-300/20 bg-panel-strong px-4 py-3 text-xs text-slate-200 shadow-2xl shadow-black/30 backdrop-blur-xl" role="status" aria-live="polite"><CheckCircle2 aria-hidden="true" className="shrink-0 text-emerald-300" size={17} /><span className="flex-1">{message}</span><button type="button" onClick={onDismiss} className="icon-button h-8 w-8" aria-label="Dismiss notification"><X aria-hidden="true" size={14} /></button></div>
}
