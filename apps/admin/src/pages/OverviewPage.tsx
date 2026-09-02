import { Boxes, LaptopMinimal, ShieldCheck, UsersRound } from 'lucide-react'
import type { DashboardMetrics } from '@laap/types'
import type { ActivityItem, AccountRow, PageName, SessionRow } from '../lib/data'
import { AccountsPreview } from '../components/AccountsPreview'
import { ActivityFeed } from '../components/ActivityFeed'
import { GlassCard } from '../components/GlassCard'
import { LeaseActivityChart } from '../components/LeaseActivityChart'
import { MetricCard } from '../components/MetricCard'
import { SecurityPostureCard } from '../components/SecurityPostureCard'

type OverviewPageProps = {
  metrics: DashboardMetrics
  sessions: SessionRow[]
  activity: ActivityItem[]
  accounts: AccountRow[]
  onNavigate: (page: PageName) => void
  userName?: string
  offline?: boolean
  isAdmin?: boolean
}

export function OverviewPage({ metrics, sessions, activity, accounts, onNavigate, userName, offline = false, isAdmin = false }: OverviewPageProps) {
  return (
    <div className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
      <section className="mb-7 flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
        <div className="max-w-2xl">
          <p className="eyebrow">Home</p>
          <h1 className="display-title mt-3">Welcome back{userName ? `, ${userName}` : ''}.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">See what is ready, what is in use, and what needs attention.</p>
        </div>
        <GlassCard className="hero-status-card relative overflow-hidden p-4 sm:min-w-[315px] sm:p-5" as="article">
          <div className="absolute -right-14 -top-20 h-44 w-44 rounded-full bg-cyan-300/10 blur-3xl" aria-hidden="true" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">Workspace status</p>
              <p className={`mt-2 flex items-center gap-2 text-sm font-medium ${offline ? 'text-amber-200' : 'text-slate-200'}`}><span className={`live-dot ${offline ? 'live-dot-warning' : ''}`} aria-hidden="true" />{offline ? 'Working offline' : 'Everything is up to date'}</p>
            </div>
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200"><ShieldCheck aria-hidden="true" size={20} /></div>
          </div>
          <div className="relative mt-4 border-t border-white/[0.07] pt-3 text-[11px] text-slate-500">{offline ? 'We will reconnect automatically when the service is available.' : 'Changes are checked automatically.'}</div>
        </GlassCard>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workspace summary">
        <MetricCard label="Ready accounts" value={String(metrics.availableAccounts)} supporting={`of ${metrics.totalAccounts} total`} icon={Boxes} tone="violet" />
        <MetricCard label="In use now" value={String(metrics.activeLeases)} supporting="People using an account" icon={ShieldCheck} tone="cyan" />
        <MetricCard label="Connected computers" value={String(metrics.boundDevices)} supporting={`${metrics.healthyDevices} ready to use`} icon={LaptopMinimal} tone="green" />
        <MetricCard label={isAdmin ? 'Team members' : 'Your accounts'} value={String(isAdmin ? metrics.authorizedUsers : metrics.totalAccounts)} supporting={isAdmin ? `${metrics.activeUsers} active recently` : 'Assigned to you'} icon={isAdmin ? UsersRound : Boxes} tone="amber" />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,.75fr)]"><LeaseActivityChart metrics={metrics} sessions={sessions} /><SecurityPostureCard /></section>
      <section className="mt-5"><ActivityFeed items={activity} onOpenHistory={() => onNavigate('Audit log')} /></section>
      <section className="mt-5"><AccountsPreview accounts={accounts} onOpenAccounts={() => onNavigate('Account pool')} /></section>
    </div>
  )
}
