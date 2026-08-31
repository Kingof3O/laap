import { Boxes, Clock3, LaptopMinimal, ShieldCheck, UsersRound } from 'lucide-react'
import type { DashboardMetrics } from '@laap/types'
import type { ActivityItem, AccountRow, SessionRow } from '../lib/data'
import { AccountsPreview } from '../components/AccountsPreview'
import { ActivityFeed } from '../components/ActivityFeed'
import { GlassCard } from '../components/GlassCard'
import { LeaseActivityChart } from '../components/LeaseActivityChart'
import { MetricCard } from '../components/MetricCard'
import { SecurityPostureCard } from '../components/SecurityPostureCard'
import { SessionTable } from '../components/SessionTable'

type OverviewPageProps = { metrics: DashboardMetrics; sessions: SessionRow[]; activity: ActivityItem[]; accounts: AccountRow[]; onRelease: (session: SessionRow) => void }

export function OverviewPage({ metrics, sessions, activity, accounts, onRelease }: OverviewPageProps) {
  return <div className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
    <section className="mb-7 flex flex-col justify-between gap-6 xl:flex-row xl:items-end"><div className="max-w-2xl"><p className="eyebrow">Operations / Overview</p><h1 className="display-title mt-3">Operational clarity,<br className="hidden sm:block" /> at a glance.</h1><p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">Monitor leases, devices, and runtime health across your account pool. Every state is synced in real time.</p></div><GlassCard className="hero-status-card relative overflow-hidden p-4 sm:min-w-[315px] sm:p-5" as="article"><div className="absolute -right-14 -top-20 h-44 w-44 rounded-full bg-cyan-300/10 blur-3xl" aria-hidden="true" /><div className="relative flex items-center justify-between gap-4"><div><p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">Live workspace status</p><p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-200"><span className="live-dot" aria-hidden="true" />Everything is in sync</p></div><div className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200"><ShieldCheck aria-hidden="true" size={20} /></div></div><div className="relative mt-4 flex items-center justify-between border-t border-white/[0.07] pt-3 text-[11px]"><span className="text-slate-500">Last full check</span><span className="font-mono text-slate-300">12:42:08 UTC</span></div></GlassCard></section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workspace metrics"><MetricCard label="Available accounts" value={String(metrics.availableAccounts)} supporting={`of ${metrics.totalAccounts} pooled accounts`} trend="6.2%" icon={Boxes} tone="violet" /><MetricCard label="Active leases" value={String(metrics.activeLeases).padStart(2, '0')} supporting={`${metrics.inGameLeases} in game · ${metrics.inClientLeases} in client`} trend="2.1%" icon={Clock3} tone="cyan" /><MetricCard label="Bound devices" value={String(metrics.boundDevices)} supporting={`${metrics.healthyDevices} healthy · ${Math.max(0, metrics.boundDevices - metrics.healthyDevices)} review`} icon={LaptopMinimal} tone="green" /><MetricCard label="Authorized users" value={String(metrics.authorizedUsers)} supporting={`${metrics.activeUsers} active this week`} trend="4.7%" icon={UsersRound} tone="amber" /></section>
    <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,.75fr)]"><LeaseActivityChart /><SecurityPostureCard /></section>
    <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,.75fr)]"><SessionTable sessions={sessions} onRelease={onRelease} /><ActivityFeed items={activity} /></section>
    <section className="mt-5"><AccountsPreview accounts={accounts} /></section>
  </div>
}
