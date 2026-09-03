import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ShieldCheck, UserRoundPlus } from 'lucide-react'
import type { ApiUser } from '@laap/types'
import { api, ApiError } from '../lib/api'
import { GlassCard } from '../components/GlassCard'
import { StatusBadge } from '../components/StatusBadge'

type UsersPageProps = { offline: boolean; onToast: (message: string) => void }

export function UsersPage({ offline, onToast }: UsersPageProps) {
  const [users, setUsers] = useState<ApiUser[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ displayName: '', email: '', password: '', role: 'operator' as 'operator' | 'admin' })

  const refresh = async () => {
    if (offline) return
    try { setUsers((await api.getUsers()).users) } catch (error) { onToast(error instanceof ApiError ? error.message : 'Unable to load people') }
  }

  useEffect(() => { void refresh() }, [offline])

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    try { await api.createUser(form); onToast(`${form.displayName} was added`); setForm({ displayName: '', email: '', password: '', role: 'operator' }); await refresh() } catch (error) { onToast(error instanceof ApiError ? error.message : 'Unable to add person') }
    finally { setSaving(false) }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
      <p className="eyebrow">People</p>
      <h1 className="display-title mt-3">Authorized users.</h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">Add people to LAAP and choose what they are allowed to do.</p>

      <GlassCard className="mt-7 p-5 sm:p-6">
        <div className="flex items-center gap-2"><span className="section-icon section-icon-cyan"><UserRoundPlus aria-hidden="true" size={16} /></span><div><h2 className="section-title">Add a person</h2><p className="mt-1 text-xs text-slate-500">They will use these details to sign in to LAAP.</p></div></div>
        <form className="mt-5 grid gap-4 md:grid-cols-[1fr_1.2fr_1fr_.8fr_auto] md:items-end" onSubmit={create}>
          <Field label="Name"><input className="input-base h-11 w-full px-3 text-sm" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} autoComplete="name" required /></Field>
          <Field label="Email"><input className="input-base h-11 w-full px-3 text-sm" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="username" required /></Field>
          <Field label="Temporary password"><input className="input-base h-11 w-full px-3 text-sm" type="password" minLength={12} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" required /></Field>
          <Field label="Access level"><select className="input-base h-11 w-full cursor-pointer px-3 text-sm" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as typeof form.role })}><option value="operator">Operator</option><option value="admin">Administrator</option></select></Field>
          <button type="submit" disabled={saving || offline} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 text-xs font-medium text-emerald-100 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Adding…' : offline ? 'Not connected' : 'Add person'}<UserRoundPlus aria-hidden="true" size={14} /></button>
        </form>
        <p className="mt-4 text-[11px] leading-5 text-slate-500"><strong className="font-medium text-slate-400">Operator:</strong> can use assigned accounts. <strong className="font-medium text-slate-400">Administrator:</strong> can manage people and access.</p>
      </GlassCard>

      <GlassCard className="mt-5 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-5 sm:px-6"><span className="section-icon section-icon-violet"><ShieldCheck aria-hidden="true" size={16} /></span><div><h2 className="section-title">Authorized users <span className="font-mono text-[11px] text-slate-600">{users.length}</span></h2><p className="mt-1 text-xs text-slate-500">Everyone who can sign in to LAAP.</p></div></div>
        <div className="divide-y divide-white/[0.05]">{users.map((user) => <div key={user.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6"><div className="avatar avatar-indigo">{user.displayName.slice(0, 2).toUpperCase()}</div><div className="min-w-[180px] flex-1"><p className="text-xs font-medium text-slate-200">{user.displayName}</p><p className="mt-1 text-[11px] text-slate-500">{user.email}</p></div><StatusBadge value={user.role === 'admin' ? 'Administrator' : 'Operator'} compact /><StatusBadge value={user.status === 'active' ? 'Active' : user.status} compact /></div>)}{!users.length ? <p className="px-6 py-10 text-center text-xs text-slate-500">No users have been added yet.</p> : null}</div>
      </GlassCard>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{label}</span>{children}</label> }
