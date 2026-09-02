import { Activity, ArrowUpRight, CircleDot, Clock3, ShieldCheck } from 'lucide-react'
import type { ActivityItem } from '../lib/data'
import { activityTitle } from '../lib/labels'
import { GlassCard } from './GlassCard'

export function ActivityFeed({ items, onOpenHistory }: { items: ActivityItem[]; onOpenHistory: () => void }) {
  return (
    <GlassCard className="p-5 sm:p-6">
      <div><div className="flex items-center gap-2"><span className="section-icon section-icon-cyan"><Activity aria-hidden="true" size={16} /></span><h2 className="section-title">Recent updates</h2></div><p className="mt-2 text-xs text-slate-500">The latest changes in your workspace.</p></div>
      <ol className="mt-6 space-y-5">
        {items.map((item, index) => <li key={item.id} className="relative flex gap-3">{index < items.length - 1 ? <span className="absolute left-[7px] top-5 h-[calc(100%+12px)] w-px bg-white/[0.07]" aria-hidden="true" /> : null}<span className={`activity-dot activity-dot-${item.tone}`} aria-hidden="true">{item.tone === 'success' ? <ShieldCheck size={11} /> : item.tone === 'warning' ? <Clock3 size={11} /> : <CircleDot size={11} />}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="text-xs font-medium text-slate-300">{activityTitle(item.title)}</p><time className="shrink-0 font-mono text-[10px] text-slate-600">{item.time}</time></div><p className="mt-1 truncate text-[11px] text-slate-500">{item.detail}</p></div></li>)}
        {!items.length ? <li className="py-6 text-center text-xs text-slate-500">There are no updates yet.</li> : null}
      </ol>
      <button type="button" onClick={onOpenHistory} className="mt-6 inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium text-slate-400 transition hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80">See full history <ArrowUpRight aria-hidden="true" size={14} /></button>
    </GlassCard>
  )
}
