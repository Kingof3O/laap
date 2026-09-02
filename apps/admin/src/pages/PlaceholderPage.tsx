import { LockKeyhole, ShieldCheck } from 'lucide-react'
import type { PageName } from '../lib/data'
import { pageMeta } from '../lib/data'
import { GlassCard } from '../components/GlassCard'

export function PlaceholderPage({ page }: { page: Exclude<PageName, 'Overview'> }) {
  const meta = pageMeta[page]
  return (
    <div className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
      <p className="eyebrow">{meta.eyebrow}</p>
      <h1 className="display-title mt-3 max-w-3xl">{meta.title}</h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">{meta.description}</p>
      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,.7fr)]">
        <GlassCard className="min-h-[330px] p-6 sm:p-8"><div className="flex h-full flex-col justify-between"><div><span className="section-icon section-icon-violet"><LockKeyhole aria-hidden="true" size={17} /></span><h2 className="mt-6 text-xl font-semibold tracking-[-0.03em] text-slate-100">Everything in one place.</h2><p className="mt-3 max-w-lg text-sm leading-6 text-slate-400">LAAP helps your team share access without sharing Riot passwords. Each person uses the official Riot Client on an approved computer.</p></div></div></GlassCard>
        <GlassCard className="p-6"><div className="flex items-center gap-2"><span className="section-icon section-icon-green"><ShieldCheck aria-hidden="true" size={16} /></span><h2 className="section-title">Your safety checks</h2></div><div className="mt-6 space-y-4"><Guardrail label="Access is limited to your team" /><Guardrail label="Riot passwords stay private" /><Guardrail label="Only approved computers can connect" /><Guardrail label="Important changes are recorded" /></div></GlassCard>
      </div>
    </div>
  )
}

function Guardrail({ label }: { label: string }) { return <div className="flex items-center gap-3 border-b border-white/[0.05] pb-3 text-xs text-slate-400 last:border-0 last:pb-0"><span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><ShieldCheck aria-hidden="true" size={12} /></span>{label}</div> }
