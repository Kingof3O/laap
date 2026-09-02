import { ArrowRight, Boxes, Globe2 } from 'lucide-react'
import type { AccountRow } from '../lib/data'
import { GlassCard } from './GlassCard'
import { StatusBadge } from './StatusBadge'

export function AccountsPreview({ accounts, onOpenAccounts }: { accounts: AccountRow[]; onOpenAccounts: () => void }) {
  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><span className="section-icon section-icon-amber"><Boxes aria-hidden="true" size={16} /></span><h2 className="section-title">Accounts</h2></div><p className="mt-2 text-xs text-slate-500">The accounts you use most recently.</p></div>
        <button type="button" onClick={onOpenAccounts} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-xs font-medium text-slate-300 transition hover:border-white/[0.16] hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80">See all accounts <ArrowRight aria-hidden="true" size={14} /></button>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {accounts.map((account) => <div key={account.id} className="account-tile group"><div className={`account-glyph account-glyph-${account.accent}`} aria-hidden="true">{account.name.slice(0, 1)}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate font-mono text-xs font-medium text-slate-200">{account.name}</p><span className="font-mono text-[10px] text-slate-600">Lv. {account.level}</span></div><p className="mt-1 flex items-center gap-1 truncate text-[10px] text-slate-500"><Globe2 aria-hidden="true" size={11} />{account.region}</p><div className="mt-3 flex items-center justify-between gap-2"><StatusBadge value={account.status} compact /><span className="truncate text-[10px] text-slate-600">{account.lastUsed}</span></div></div></div>)}
        {!accounts.length ? <p className="col-span-full py-8 text-center text-xs text-slate-500">No accounts have been added yet.</p> : null}
      </div>
    </GlassCard>
  )
}
