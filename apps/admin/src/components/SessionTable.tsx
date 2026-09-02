import { LogOut, Monitor, Smartphone } from 'lucide-react'
import type { SessionRow } from '../lib/data'
import { GlassCard } from './GlassCard'
import { StatusBadge } from './StatusBadge'

type SessionTableProps = { sessions: SessionRow[]; onRelease: (session: SessionRow) => void }

export function SessionTable({ sessions, onRelease }: SessionTableProps) {
  return (
    <GlassCard className="overflow-hidden" aria-label="Current sessions">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-5 sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="section-icon section-icon-violet"><Monitor aria-hidden="true" size={16} /></span>
            <h2 className="section-title">Currently in use</h2>
          </div>
          <p className="mt-2 text-xs text-slate-500">See who is using an account right now.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[11px] text-slate-400"><span className="live-dot" aria-hidden="true" />{sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}</span>
      </div>
      <div className="hidden grid-cols-[1.35fr_1fr_1fr_.85fr_110px] gap-4 border-b border-white/[0.05] px-6 py-3 text-[10px] font-medium uppercase tracking-[0.13em] text-slate-600 md:grid" role="row">
        <span>Account</span><span>Person</span><span>Status</span><span>Started</span><span />
      </div>
      <div className="divide-y divide-white/[0.05]">
        {sessions.map((session) => <SessionRowItem key={session.id} session={session} onRelease={onRelease} />)}
        {!sessions.length ? <p className="px-6 py-10 text-center text-xs text-slate-500">No one is using an account right now.</p> : null}
      </div>
    </GlassCard>
  )
}

function SessionRowItem({ session, onRelease }: { session: SessionRow; onRelease: (session: SessionRow) => void }) {
  const DeviceIcon = session.device.includes('Mac') ? Smartphone : Monitor
  return (
    <div className="grid gap-4 px-5 py-4 transition hover:bg-white/[0.025] md:grid-cols-[1.35fr_1fr_1fr_.85fr_110px] md:items-center md:px-6" role="row">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`account-glyph account-glyph-${session.avatarTone}`} aria-hidden="true">{session.account.slice(0, 1)}</div>
        <div className="min-w-0"><p className="truncate font-mono text-xs font-medium text-slate-200">{session.account}</p><p className="mt-1 text-[11px] text-slate-500">{session.region}</p></div>
      </div>
      <div className="flex items-center gap-2 md:min-w-0">
        <div className={`avatar avatar-${session.avatarTone}`}>{session.initials}</div>
        <div className="min-w-0"><p className="truncate text-xs text-slate-300">{session.user}</p><p className="mt-1 flex items-center gap-1 truncate text-[11px] text-slate-600"><DeviceIcon aria-hidden="true" size={11} />{session.device}</p></div>
      </div>
      <div className="flex items-center justify-between md:block"><span className="text-[10px] uppercase tracking-[0.12em] text-slate-600 md:hidden">Status</span><StatusBadge value={session.status} /></div>
      <div className="flex items-center justify-between md:block"><span className="text-[10px] uppercase tracking-[0.12em] text-slate-600 md:hidden">Started</span><span className="font-mono text-[11px] text-slate-400">{session.started}</span></div>
      <div className="flex items-center justify-end"><button type="button" onClick={() => onRelease(session)} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-transparent px-2 text-[11px] text-slate-500 transition hover:border-rose-400/20 hover:bg-rose-400/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80" aria-label={`End session for ${session.account}`}><LogOut aria-hidden="true" size={14} /><span className="hidden sm:inline">End session</span></button></div>
    </div>
  )
}
