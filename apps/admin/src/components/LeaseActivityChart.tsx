import { CheckCircle2, CircleAlert, LayoutDashboard } from 'lucide-react'
import type { DashboardMetrics } from '@laap/types'
import type { SessionRow } from '../lib/data'
import { GlassCard } from './GlassCard'

type WorkspaceSummaryProps = { metrics: DashboardMetrics; sessions: SessionRow[] }

/**
 * A small, honest summary of the live workspace. It intentionally uses only
 * values returned by the API; there are no invented trends or placeholder
 * timestamps in the user-facing dashboard.
 */
export function LeaseActivityChart({ metrics, sessions }: WorkspaceSummaryProps) {
  const attentionCount = sessions.filter((session) => session.status === 'stale' || session.status === 'error').length
  const readyPercent = metrics.totalAccounts > 0 ? Math.round((metrics.availableAccounts / metrics.totalAccounts) * 100) : 0

  return (
    <GlassCard className="p-5 sm:p-6" aria-label="Workspace summary">
      <div className="flex items-start gap-3">
        <span className="section-icon">
          <LayoutDashboard aria-hidden="true" size={16} />
        </span>
        <div>
          <h2 className="section-title">At a glance</h2>
          <p className="mt-2 text-xs text-slate-500">A simple view of what is ready and what needs attention.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <SummaryItem label="Ready to use" value={metrics.availableAccounts} detail={`${readyPercent}% of your accounts`} tone="green" />
        <SummaryItem label="In use now" value={metrics.activeLeases} detail={metrics.activeLeases === 1 ? '1 active session' : `${metrics.activeLeases} active sessions`} tone="cyan" />
        <SummaryItem label="Needs attention" value={attentionCount} detail={attentionCount ? 'Check these sessions' : 'Everything looks good'} tone={attentionCount ? 'amber' : 'green'} />
      </div>

      <div className="mt-6 rounded-2xl border border-white/[0.05] bg-slate-950/25 p-4">
        <div className="flex items-center justify-between gap-3 text-[11px]">
          <span className="text-slate-400">Account availability</span>
          <span className="font-mono text-slate-300">{metrics.availableAccounts} / {metrics.totalAccounts} ready</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-300/80 to-cyan-300/80 transition-[width] duration-500" style={{ width: `${readyPercent}%` }} />
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.045] p-4">
        <p className="text-[11px] font-medium text-cyan-100">Ready to start?</p>
        <p className="mt-1 text-[11px] leading-5 text-slate-400">Open LAAP Desktop, choose a ready account, and sign in through Riot Client.</p>
      </div>
    </GlassCard>
  )
}

function SummaryItem({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: 'green' | 'cyan' | 'amber' }) {
  const Icon = tone === 'amber' ? CircleAlert : CheckCircle2
  const color = tone === 'amber' ? 'text-amber-200' : tone === 'cyan' ? 'text-cyan-200' : 'text-emerald-200'
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.025] p-4">
      <div className="flex items-center gap-2 text-[11px] text-slate-500"><Icon aria-hidden="true" className={color} size={14} />{label}</div>
      <p className="mt-3 font-mono text-2xl font-semibold tracking-[-0.04em] text-slate-100">{value}</p>
      <p className="mt-1 text-[11px] text-slate-600">{detail}</p>
    </div>
  )
}
