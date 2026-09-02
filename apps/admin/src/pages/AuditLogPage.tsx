import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ClipboardList, FileClock } from 'lucide-react'
import { api, ApiError, type AuditEntry } from '../lib/api'
import { actionLabel } from '../lib/labels'
import { GlassCard } from '../components/GlassCard'

type AuditLogPageProps = { offline: boolean; onToast: (message: string) => void }
const PAGE_SIZE = 10

export function AuditLogPage({ offline, onToast }: AuditLogPageProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ limit: PAGE_SIZE, offset: 0, hasMore: false })

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      if (offline) { setEntries([]); setPagination({ limit: PAGE_SIZE, offset: 0, hasMore: false }); return }
      setLoading(true)
      try {
        const result = await api.getAudit({ limit: PAGE_SIZE, offset: page * PAGE_SIZE })
        if (cancelled) return
        setEntries(result.audit)
        setPagination(result.pagination)
      } catch (error) {
        if (!cancelled) onToast(error instanceof ApiError ? error.message : 'Unable to load history')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void refresh()
    return () => { cancelled = true }
  }, [offline, onToast, page])

  const firstItem = entries.length ? pagination.offset + 1 : 0
  const lastItem = pagination.offset + entries.length
  const canGoBack = page > 0 && !loading
  const canGoForward = pagination.hasMore && !loading

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
      <p className="eyebrow">History</p>
      <h1 className="display-title mt-3">Recent activity.</h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">Review the important changes made in your workspace.</p>
      <GlassCard className="mt-7 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-5 sm:px-6"><span className="section-icon section-icon-amber"><ClipboardList aria-hidden="true" size={16} /></span><div><h2 className="section-title">Recent actions</h2><p className="mt-1 text-xs text-slate-500">Important actions are recorded automatically.</p></div></div>
        <div className="divide-y divide-white/[0.05]">{entries.map((entry) => <div key={entry.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6"><div className="grid h-9 w-9 place-items-center rounded-xl border border-amber-300/15 bg-amber-300/10 text-amber-200"><FileClock aria-hidden="true" size={16} /></div><div className="min-w-[190px] flex-1"><p className="text-xs font-medium text-slate-200">{actionLabel(entry.action)}</p><p className="mt-1 text-[11px] text-slate-500">{entry.actor}</p></div><span className="font-mono text-[10px] text-slate-600">{new Date(entry.createdAt).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>)}{loading && !entries.length ? <p className="px-6 py-10 text-center text-xs text-slate-500">Loading activity…</p> : null}{!loading && !entries.length ? <p className="px-6 py-10 text-center text-xs text-slate-500">No activity has been recorded yet.</p> : null}</div>
        {entries.length || pagination.offset > 0 ? <div className="flex flex-col gap-3 border-t border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><p className="text-[11px] text-slate-500">Showing {firstItem}–{lastItem} · Page {page + 1}</p><div className="flex items-center gap-2"><button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={!canGoBack} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-xs font-medium text-slate-300 transition hover:border-white/[0.16] hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft aria-hidden="true" size={14} />Previous</button><button type="button" onClick={() => setPage((current) => current + 1)} disabled={!canGoForward} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs font-medium text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-40">Next<ChevronRight aria-hidden="true" size={14} /></button></div></div> : null}
      </GlassCard>
    </div>
  )
}
