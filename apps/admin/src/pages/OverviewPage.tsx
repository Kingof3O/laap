import { DollarSign, Gift, Server, ShieldCheck, Sparkles, TrendingUp, Users, Zap } from 'lucide-react'
import { GlassCard } from '../components/GlassCard'
import { MetricCard } from '../components/MetricCard'
import type { OverviewData, PageName } from '../lib/types'

type OverviewPageProps = {
  data: OverviewData | null
  loading: boolean
  onNavigate: (page: PageName) => void
  onRefresh: () => void
}

export function OverviewPage({ data, loading, onNavigate, onRefresh }: OverviewPageProps) {
  const metrics = data?.metrics ?? {
    totalUsers: 0,
    activeSubscribers: 0,
    planCounts: { monthly: 0, yearly: 0, lifetime: 0, gifts: 0 },
    mrr: 0,
    totalRevenue: 0,
    totalGifts: 0,
    activeGifts: 0,
    redeemedGifts: 0,
  }

  const health = data?.health ?? {
    worker: 'healthy',
    supabase: 'healthy',
    paddle: 'sandbox',
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Est. Monthly Revenue"
          value={`$${metrics.mrr.toFixed(2)}`}
          supporting={`${metrics.planCounts.monthly} monthly · ${metrics.planCounts.yearly} yearly`}
          icon={DollarSign}
          tone="green"
        />
        <MetricCard
          label="Active Pro Grants"
          value={String(metrics.activeSubscribers)}
          supporting={`${metrics.planCounts.lifetime} lifetime · ${metrics.planCounts.gifts} active gift codes`}
          icon={Zap}
          tone="violet"
        />
        <MetricCard
          label="Total Registered Users"
          value={String(metrics.totalUsers)}
          supporting="Supabase Auth verified directory"
          icon={Users}
          tone="cyan"
        />
        <MetricCard
          label="Gift & Promo Codes"
          value={`${metrics.activeGifts} active`}
          supporting={`${metrics.redeemedGifts} redeemed / ${metrics.totalGifts} created`}
          icon={Gift}
          tone="amber"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Subscription Breakdown */}
        <GlassCard className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Distribution</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-100">License & Plan Breakdown</h2>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="text-xs text-slate-400 hover:text-slate-200 transition"
            >
              Refresh
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <div className="flex justify-between text-xs text-slate-300">
                <span>Monthly Subscriptions ($3/mo)</span>
                <span className="font-mono">{metrics.planCounts.monthly} active</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full bg-cyan-400 transition-all duration-500"
                  style={{
                    width: `${metrics.activeSubscribers > 0 ? (metrics.planCounts.monthly / metrics.activeSubscribers) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300">
                <span>Yearly Subscriptions ($20/yr)</span>
                <span className="font-mono">{metrics.planCounts.yearly} active</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full bg-emerald-400 transition-all duration-500"
                  style={{
                    width: `${metrics.activeSubscribers > 0 ? (metrics.planCounts.yearly / metrics.activeSubscribers) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300">
                <span>Lifetime Pro Licenses ($60 one-time)</span>
                <span className="font-mono">{metrics.planCounts.lifetime} owned</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full bg-violet-400 transition-all duration-500"
                  style={{
                    width: `${metrics.activeSubscribers > 0 ? (metrics.planCounts.lifetime / metrics.activeSubscribers) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300">
                <span>Gift & Promotional Grants</span>
                <span className="font-mono">{metrics.planCounts.gifts} active</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full bg-amber-400 transition-all duration-500"
                  style={{
                    width: `${metrics.activeSubscribers > 0 ? (metrics.planCounts.gifts / metrics.activeSubscribers) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Total Lifetime Volume</p>
              <p className="mt-1 font-mono text-xl font-semibold text-slate-100">${metrics.totalRevenue.toFixed(2)}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onNavigate('Customers')}
                className="btn-secondary px-3.5 py-2 text-xs font-medium rounded-xl"
              >
                Manage Customers
              </button>
              <button
                type="button"
                onClick={() => onNavigate('Gifts')}
                className="btn-primary px-3.5 py-2 text-xs font-medium rounded-xl"
              >
                Generate Promo Code
              </button>
            </div>
          </div>
        </GlassCard>

        {/* Infrastructure & System Status */}
        <GlassCard className="p-6">
          <p className="eyebrow">Reliability</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">System Health</h2>

          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                <div>
                  <p className="text-xs font-medium text-slate-200">Cloudflare Billing Worker</p>
                  <p className="text-[11px] text-slate-500 font-mono">Edge Runtime · TLS 1.3</p>
                </div>
              </div>
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                {health.worker}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                <div>
                  <p className="text-xs font-medium text-slate-200">Supabase Auth & DB</p>
                  <p className="text-[11px] text-slate-500 font-mono">laap_billing schema</p>
                </div>
              </div>
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                {health.supabase}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(103,232,249,0.5)]" />
                <div>
                  <p className="text-xs font-medium text-slate-200">Paddle Billing</p>
                  <p className="text-[11px] text-slate-500 font-mono">Webhooks & API</p>
                </div>
              </div>
              <span className="rounded-md bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                {health.paddle}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-2.5 w-2.5 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.5)]" />
                <div>
                  <p className="text-xs font-medium text-slate-200">Cron Reconciler</p>
                  <p className="text-[11px] text-slate-500 font-mono">Every 5 minutes</p>
                </div>
              </div>
              <span className="rounded-md bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                active
              </span>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-4 text-xs text-amber-200/90 leading-relaxed">
            <p className="font-semibold text-amber-100 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              Owner Quick Guide
            </p>
            <p className="mt-1">
              Need to unblock a user whose PC was replaced? Open <strong>Customers</strong> and click{' '}
              <strong>Transfer Override</strong>.
            </p>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
