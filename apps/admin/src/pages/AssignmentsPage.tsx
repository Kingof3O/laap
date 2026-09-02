import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, Link2, UserPlus, X } from 'lucide-react'
import type { ApiUser, DashboardAccount } from '@laap/types'
import { api, ApiError } from '../lib/api'
import { assignmentStatusLabel } from '../lib/labels'
import { GlassCard } from '../components/GlassCard'
import { StatusBadge } from '../components/StatusBadge'

type Assignment = { id: string; accountId: string; userId: string; account: string; user: string; email: string; status: string; assignedAt: string; expiresAt: string | null }
type AssignmentsPageProps = { initialAccounts: DashboardAccount[]; offline: boolean; onToast: (message: string) => void }

export function AssignmentsPage({ initialAccounts, offline, onToast }: AssignmentsPageProps) {
  const [rows, setRows] = useState<Assignment[]>([])
  const [accounts, setAccounts] = useState(initialAccounts)
  const [users, setUsers] = useState<ApiUser[]>([])
  const [form, setForm] = useState({ accountId: initialAccounts.find((account) => account.status === 'Available')?.id ?? '', userId: '', expiresAt: '' })
  const [saving, setSaving] = useState(false)

  const refresh = async () => {
    if (offline) return
    try {
      const [assignmentResult, accountResult, userResult] = await Promise.all([api.getAssignments(), api.getAccounts(), api.getUsers()])
      setRows(assignmentResult.assignments)
      setAccounts(accountResult.accounts)
      setUsers(userResult.users.filter((user) => user.role !== 'admin'))
      setForm((current) => ({ ...current, accountId: current.accountId || accountResult.accounts.find((account) => account.status === 'Available')?.id || '' }))
    } catch (error) { onToast(error instanceof ApiError ? error.message : 'Unable to load access') }
  }

  useEffect(() => { void refresh() }, [offline])

  const assign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    try {
      await api.addAssignment({ accountId: form.accountId, userId: form.userId, expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null })
      onToast('Access granted')
      setForm((current) => ({ ...current, userId: '', expiresAt: '' }))
      await refresh()
    } catch (error) { onToast(error instanceof ApiError ? error.message : 'Unable to grant access') }
    finally { setSaving(false) }
  }

  const revoke = async (row: Assignment) => {
    try { await api.revokeAssignment(row.accountId, row.userId); onToast(`Access removed for ${row.user}`); await refresh() } catch (error) { onToast(error instanceof ApiError ? error.message : 'Unable to remove access') }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
      <p className="eyebrow">Access</p>
      <h1 className="display-title mt-3">Who can use each account.</h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">Give people access to the accounts they need, and remove it when you are done.</p>

      <GlassCard className="mt-7 p-5 sm:p-6">
        <div className="flex items-center gap-2"><span className="section-icon section-icon-cyan"><UserPlus aria-hidden="true" size={16} /></span><div><h2 className="section-title">Give someone access</h2><p className="mt-1 text-xs text-slate-500">Choose an account and the person who should use it.</p></div></div>
        <form className="mt-5 grid gap-4 md:grid-cols-[1.2fr_1.2fr_1fr_auto] md:items-end" onSubmit={assign}>
          <Field label="Account"><select className="input-base h-11 w-full cursor-pointer px-3 text-sm" value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })} required><option value="">Select account</option>{accounts.filter((account) => account.status === 'Available').map((account) => <option key={account.id} value={account.id}>{account.name} · {account.region}</option>)}</select></Field>
          <Field label="Person"><select className="input-base h-11 w-full cursor-pointer px-3 text-sm" value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })} required><option value="">Select person</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.email}</option>)}</select></Field>
          <Field label="End date (optional)"><input className="input-base h-11 w-full px-3 text-sm" type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></Field>
          <button type="submit" disabled={saving || offline || !form.accountId || !form.userId} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-xs font-medium text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving…' : offline ? 'Not connected' : 'Give access'}<ArrowRight aria-hidden="true" size={14} /></button>
        </form>
        <p className="mt-4 text-[11px] leading-5 text-slate-500">People still sign in to Riot Client themselves. LAAP never asks for or stores their Riot password.</p>
      </GlassCard>

      <GlassCard className="mt-5 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-5 sm:px-6"><span className="section-icon section-icon-violet"><Link2 aria-hidden="true" size={16} /></span><div><h2 className="section-title">Current access <span className="font-mono text-[11px] text-slate-600">{rows.filter((row) => row.status === 'active').length}</span></h2><p className="mt-1 text-xs text-slate-500">People who can use an account.</p></div></div>
        <div className="divide-y divide-white/[0.05]">{rows.map((row) => <div key={row.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6"><div className="account-glyph account-glyph-violet" aria-hidden="true">{row.account.slice(0, 1)}</div><div className="min-w-[170px] flex-1"><p className="font-mono text-xs font-medium text-slate-200">{row.account}</p><p className="mt-1 text-[11px] text-slate-500">{row.user} · {row.email}</p></div><StatusBadge value={assignmentStatusLabel(row.status)} compact /><button type="button" onClick={() => void revoke(row)} disabled={row.status !== 'active' || offline} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-transparent px-3 text-[11px] text-slate-500 transition hover:border-rose-400/20 hover:bg-rose-400/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80"><X aria-hidden="true" size={13} />Remove access</button></div>)}{!rows.length ? <p className="px-6 py-10 text-center text-xs text-slate-500">No one has been given access yet.</p> : null}</div>
      </GlassCard>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{label}</span>{children}</label> }
