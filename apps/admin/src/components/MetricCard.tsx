import type { LucideIcon } from 'lucide-react'
import { GlassCard } from './GlassCard'

type MetricCardProps = {
  label: string
  value: string
  supporting: string
  icon: LucideIcon
  tone: 'violet' | 'cyan' | 'green' | 'amber'
}

const toneClasses = {
  violet: 'metric-icon-violet',
  cyan: 'metric-icon-cyan',
  green: 'metric-icon-green',
  amber: 'metric-icon-amber',
}

export function MetricCard({ label, value, supporting, icon: Icon, tone }: MetricCardProps) {
  return (
    <GlassCard className="metric-card group p-5" as="article">
      <div className="flex items-start justify-between gap-4">
        <div className={`metric-icon ${toneClasses[tone]}`}>
          <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
        </div>
      </div>
      <div className="mt-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <p className="mt-1 font-mono text-[27px] font-semibold tracking-[-0.04em] text-slate-100">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{supporting}</p>
      </div>
    </GlassCard>
  )
}
