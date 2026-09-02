import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Boxes, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react'
import type { DashboardAccount } from '@laap/types'
import { api, ApiError } from '../lib/api'
import { accountStatusLabel } from '../lib/labels'
import { GlassCard } from '../components/GlassCard'
import { StatusBadge } from '../components/StatusBadge'

type AccountsPageProps = { initialAccounts: DashboardAccount[]; offline: boolean; canManageAccounts: boolean; onToast: (message: string) => void }

export function AccountsPage({ initialAccounts, offline, canManageAccounts, onToast }: AccountsPageProps) {
  const [rows, setRows] = useState(initialAccounts)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | DashboardAccount['status']>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ displayName: '', externalId: '', region: 'EUW', status: 'available' as 'available' | 'maintenance' | 'disabled' })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const refresh = async () => {
    if (offline) return
    try { setRows((await api.getAccounts()).accounts) } catch (error) { onToast(error instanceof ApiError ? error.message : 'Unable to load accounts') }
  }

  useEffect(() => { void refresh() }, [offline])

  const filtered = useMemo(() => rows.filter((row) => {
    const matchesSearch = !query || `${row.name} ${row.region}`.toLowerCase().includes(query.trim().toLowerCase())
    return matchesSearch && (status === 'all' || row.status === status)
  }), [query, rows, status])

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    try {
      await api.createAccount(form)
      onToast(`Account ${form.displayName} added`)
      setForm({ displayName: '', externalId: '', region: 'EUW', status: 'available' })
      setShowCreate(false)
      await refresh()
    } catch (error) { onToast(error instanceof ApiError ? error.message : 'Unable to add account') }
    finally { setSaving(false) }
  }

  const remove = async (account: DashboardAccount) => {
    if (!window.confirm(`Are you sure you want to remove "${account.name}" from the pool?`)) return
    setDeletingId(account.id)
    try {
      await api.deleteAccount(account.id)
      onToast(`Account ${account.name} removed from pool`)
      await refresh()
    } catch (error) {
      onToast(error instanceof ApiError ? error.message : 'Unable to remove account')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Accounts</p>
          <h1 className="display-title mt-3">{canManageAccounts ? 'All accounts.' : 'Your accounts.'}</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">See which accounts are ready, in use, or temporarily unavailable.</p>
        </div>
        {canManageAccounts ? <button type="button" onClick={() => setShowCreate((value) => !value)} className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-xs font-medium text-cyan-100 transition hover:bg-cyan-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80"><Plus aria-hidden="true" size={15} />{showCreate ? 'Close' : 'Add account'}</button> : null}
      </div>

      {showCreate ? <GlassCard className="mt-6 p-5 sm:p-6"><div className="mb-4"><h2 className="section-title">Add an account</h2><p className="mt-1 text-xs text-slate-500">Add the account details your team needs. Riot passwords never enter LAAP.</p></div><form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.3fr_1.3fr_.7fr_.8fr_auto] lg:items-end" onSubmit={create}><Field label="Name shown to your team"><input className="input-base h-11 w-full px-3 text-sm" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="Northwind · EUW" required /></Field><Field label="Riot account reference"><input className="input-base h-11 w-full px-3 text-sm" value={form.externalId} onChange={(event) => setForm({ ...form, externalId: event.target.value })} placeholder="Riot ID or approved reference" required /></Field><Field label="Region"><select className="input-base h-11 w-full cursor-pointer px-3 text-sm" value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })}><option>EUW</option><option>NA</option><option>KR</option><option>BR</option><option>EUNE</option></select></Field><Field label="Availability"><select className="input-base h-11 w-full cursor-pointer px-3 text-sm" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as typeof form.status })}><option value="available">Ready</option><option value="maintenance">Temporarily unavailable</option><option value="disabled">Disabled</option></select></Field><button disabled={saving || offline} type="submit" className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 text-xs font-medium text-emerald-100 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Adding…' : offline ? 'Not connected' : 'Add account'}</button></form></GlassCard> : null}

      <GlassCard className="mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 sm:px-6"><div className="flex items-center gap-2"><span className="section-icon section-icon-violet"><Boxes aria-hidden="true" size={16} /></span><div><h2 className="section-title">{canManageAccounts ? 'All accounts' : 'Available to you'} <span className="font-mono text-[11px] text-slate-600">{rows.length}</span></h2><p className="mt-1 text-xs text-slate-500">Choose an account that is ready to use.</p></div></div><div className="flex w-full items-center gap-2 sm:w-auto"><label className="relative min-w-0 flex-1 sm:w-[190px]"><span className="sr-only">Search accounts</span><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={14} /><input aria-label="Search accounts" className="input-base h-10 w-full pl-9 pr-3 text-xs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an account" /></label><label className="relative"><span className="sr-only">Filter account availability</span><SlidersHorizontal aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={14} /><select aria-label="Filter account availability" className="input-base h-10 cursor-pointer appearance-none pl-9 pr-3 text-xs" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">All accounts</option><option value="Available">Ready</option><option value="Leased">In use</option><option value="Maintenance">Unavailable</option><option value="Disabled">Disabled</option></select></label></div></div>
        <div className="divide-y divide-white/[0.05]">{filtered.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition hover:bg-white/[0.025] sm:px-6">
            <div className="flex items-center gap-4 flex-1 min-w-[200px]">
              <div className={`account-glyph account-glyph-${row.accent}`} aria-hidden="true">{row.name.slice(0, 1)}</div>
              <div>
                <p className="font-mono text-xs font-medium text-slate-200">{row.name}</p>
                <p className="mt-1 text-[11px] text-slate-500">{row.region} · Level {row.level}</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="w-[140px] text-right sm:text-left">
                <StatusBadge value={accountStatusLabel(row.status)} compact />
                <p className="mt-1 text-[10px] text-slate-600">Last used {row.lastUsed}</p>
              </div>
              {canManageAccounts ? (
                <button
                  type="button"
                  onClick={() => void remove(row)}
                  disabled={deletingId === row.id}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 transition hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50"
                  title="Remove account from pool"
                >
                  <Trash2 size={13} />
                </button>
              ) : null}
            </div>
          </div>
        ))}{filtered.length === 0 ? <p className="px-6 py-10 text-center text-xs text-slate-500">No accounts match your search.</p> : null}</div>
      </GlassCard>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{label}</span>{children}</label> }
