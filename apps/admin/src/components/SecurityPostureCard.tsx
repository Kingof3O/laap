import { Check, LockKeyhole, ShieldCheck } from 'lucide-react'
import { GlassCard } from './GlassCard'

export function SecurityPostureCard() {
  return (
    <GlassCard className="relative overflow-hidden p-5 sm:p-6">
      <div className="absolute -right-12 -top-14 h-40 w-40 rounded-full bg-violet-400/10 blur-3xl" aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="section-icon section-icon-green"><ShieldCheck aria-hidden="true" size={16} /></span>
            <h2 className="section-title">Safety</h2>
          </div>
          <p className="mt-2 text-xs text-slate-500">The safeguards that keep your workspace private.</p>
        </div>
        <span className="rounded-full border border-emerald-400/15 bg-emerald-400/10 px-2 py-1 text-[10px] font-medium text-emerald-300">Protected</span>
      </div>

      <div className="relative mt-6 space-y-3">
        <SafetyCheck label="Riot passwords never enter LAAP" />
        <SafetyCheck label="Only approved computers can start a session" />
        <SafetyCheck label="One person can use an account at a time" />
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.045] p-3">
        <LockKeyhole aria-hidden="true" className="mt-0.5 shrink-0 text-cyan-200" size={16} />
        <p className="text-[11px] leading-5 text-slate-400">Sign in to Riot Client yourself. LAAP only manages access and keeps track of the session.</p>
      </div>
    </GlassCard>
  )
}

function SafetyCheck({ label }: { label: string }) {
  return <div className="flex items-start gap-2 text-xs leading-5 text-slate-400"><span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check aria-hidden="true" size={10} strokeWidth={3} /></span>{label}</div>
}
