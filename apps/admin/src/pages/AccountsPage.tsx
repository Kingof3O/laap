import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, Boxes, KeyRound, Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
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
  const [editing, setEditing] = useState<DashboardAccount | null>(null)
  const [editForm, setEditForm] = useState({ displayName: '', externalId: '', region: 'EUW', status: 'available' as 'available' | 'maintenance' | 'disabled' })

  const [confirmAction, setConfirmAction] = useState<{
    type: 'delete' | 'clearSession' | 'forceRelease'
    account: DashboardAccount
  } | null>(null)

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

  const remove = (account: DashboardAccount) => {
    setConfirmAction({ type: 'delete', account })
  }

  const forceRelease = (account: DashboardAccount) => {
    setConfirmAction({ type: 'forceRelease', account })
  }

  const clearSession = (account: DashboardAccount) => {
    setConfirmAction({ type: 'clearSession', account })
  }

  const openEdit = (account: DashboardAccount) => {
    setEditing(account)
    setEditForm({ displayName: account.name, externalId: account.externalId ?? account.name, region: account.region, status: account.status === 'Maintenance' ? 'maintenance' : account.status === 'Disabled' ? 'disabled' : 'available' })
  }

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing) return
    setSaving(true)
    try {
      await api.updateAccount(editing.id, editForm)
      onToast(`Account ${editForm.displayName} updated`)
      setEditing(null)
      await refresh()
    } catch (error) {
      onToast(error instanceof ApiError ? error.message : 'Unable to update account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Accounts</p>
          <h1 className="display-title mt-3">Your account pool.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">See which accounts are ready, in use, or temporarily unavailable.</p>
        </div>
        {canManageAccounts ? (
          <button type="button" onClick={() => setShowCreate((v) => !v)} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-violet-400/25 bg-violet-400/10 px-4 text-xs font-medium text-violet-200 transition hover:bg-violet-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80">
            <Plus aria-hidden="true" size={15} /><span>{showCreate ? 'Close form' : 'Add account'}</span>
          </button>
        ) : null}
      </div>

      {showCreate ? (
        <GlassCard className="mt-7 p-5 sm:p-6">
          <h2 className="section-title">Add a Riot account to the pool</h2>
          <form className="mt-5 grid gap-4 md:grid-cols-[1.5fr_1.2fr_1fr_1fr_auto] md:items-end" onSubmit={create}>
            <Field label="Display name"><input className="input-base h-11 w-full px-3 text-sm" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="Nova#EUW" required /></Field>
            <Field label="Riot ID"><input className="input-base h-11 w-full px-3 text-sm" value={form.externalId} onChange={(event) => setForm({ ...form, externalId: event.target.value })} placeholder="nova-euw" required /></Field>
            <Field label="Region"><select className="input-base h-11 w-full cursor-pointer px-3 text-sm" value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })}><option value="EUW">EU West</option><option value="EUNE">EU Nordic & East</option><option value="NA">North America</option><option value="KR">Korea</option><option value="BR">Brazil</option></select></Field>
            <Field label="Initial status"><select className="input-base h-11 w-full cursor-pointer px-3 text-sm" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as typeof form.status })}><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="disabled">Disabled</option></select></Field>
            <button type="submit" disabled={saving || offline} className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 text-xs font-medium text-emerald-100 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving…' : offline ? 'Not connected' : 'Save account'}</button>
          </form>
        </GlassCard>
      ) : null}

      <GlassCard className="mt-7 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
            <input className="input-base h-10 w-full pl-9 pr-3 text-xs" placeholder="Search accounts by name or region…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="text-slate-500" size={14} />
            <select className="input-base h-10 cursor-pointer px-3 text-xs" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="all">All statuses</option>
              <option value="Available">Available</option>
              <option value="Leased">In use</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Disabled">Disabled</option>
            </select>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="mt-5 overflow-hidden">
        <div className="divide-y divide-white/[0.05]">{filtered.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition hover:bg-white/[0.025] sm:px-6">
            <div className="flex items-center gap-3">
              <div className={`account-glyph account-glyph-${row.accent}`}>{row.name.slice(0, 1)}</div>
              <div>
                <p className="font-mono text-xs font-medium text-slate-200">{row.name}</p>
                <p className="mt-1 text-[11px] text-slate-500">{row.region} · Level {row.level}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-[140px] text-right sm:text-left flex flex-col gap-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <StatusBadge value={accountStatusLabel(row.status)} compact />
                  {row.hasSessionBlob === false ? (
                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-400/10 text-amber-300 border border-amber-400/20">
                      Needs Login
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {canManageAccounts ? (
                  <button type="button" onClick={() => openEdit(row)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-400 transition hover:border-cyan-400/20 hover:bg-cyan-400/10 hover:text-cyan-300" title="Edit account">
                    <Pencil size={13} />
                  </button>
                ) : null}
                {canManageAccounts && row.status === 'Leased' ? (
                  <button
                    type="button"
                    onClick={() => forceRelease(row)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-400 transition hover:bg-amber-500/20 hover:text-amber-300"
                    title="Force release / Kick account"
                  >
                    <RotateCcw size={13} />
                  </button>
                ) : null}
                {canManageAccounts ? (
                  <button
                    type="button"
                    onClick={() => clearSession(row)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-cyan-400 transition hover:bg-cyan-500/20 hover:text-cyan-300"
                    title="Revoke stored login session token"
                  >
                    <KeyRound size={13} />
                  </button>
                ) : null}
                {canManageAccounts ? (
                  <button
                    type="button"
                    onClick={() => remove(row)}
                    disabled={deletingId === row.id}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 transition hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50"
                    title="Remove account from pool"
                  >
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ))}{filtered.length === 0 ? <p className="px-6 py-10 text-center text-xs text-slate-500">No accounts match your search.</p> : null}</div>
      </GlassCard>
      {editing ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-5 backdrop-blur-sm"><GlassCard className="w-full max-w-lg p-6" role="dialog" aria-modal="true" aria-labelledby="edit-account-title"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Accounts</p><h2 id="edit-account-title" className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-100">Edit {editing.name}</h2><p className="mt-2 text-xs leading-5 text-slate-500">Update the details your team sees.</p></div><button type="button" className="icon-button h-9 w-9" onClick={() => setEditing(null)} aria-label="Close edit account"><X aria-hidden="true" size={16} /></button></div><form className="mt-6 space-y-4" onSubmit={saveEdit}><Field label="Display name"><input className="input-base h-11 w-full px-3 text-sm" value={editForm.displayName} onChange={(event) => setEditForm({ ...editForm, displayName: event.target.value })} required /></Field><Field label="Riot ID"><input className="input-base h-11 w-full px-3 text-sm" value={editForm.externalId} onChange={(event) => setEditForm({ ...editForm, externalId: event.target.value })} required /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Region"><select className="input-base h-11 w-full cursor-pointer px-3 text-sm" value={editForm.region} onChange={(event) => setEditForm({ ...editForm, region: event.target.value })}><option value="EUW">EU West</option><option value="EUNE">EU Nordic & East</option><option value="NA">North America</option><option value="KR">Korea</option><option value="BR">Brazil</option></select></Field><Field label="Status"><select className="input-base h-11 w-full cursor-pointer px-3 text-sm" value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value as typeof editForm.status })}><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="disabled">Disabled</option></select></Field></div><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setEditing(null)} className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 text-xs font-medium text-slate-300 transition hover:bg-white/[0.06]">Cancel</button><button type="submit" disabled={saving || offline} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-xs font-medium text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}<ArrowRight aria-hidden="true" size={14} /></button></div></form></GlassCard></div> : null}

      {confirmAction ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-5 backdrop-blur-sm">
          <GlassCard className="w-full max-w-md p-6" role="dialog" aria-modal="true">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">
                  {confirmAction.type === 'delete'
                    ? 'Remove Account'
                    : confirmAction.type === 'forceRelease'
                    ? 'Force Release'
                    : 'Revoke Session'}
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-100">
                  {confirmAction.type === 'delete'
                    ? `Remove ${confirmAction.account.name}?`
                    : confirmAction.type === 'forceRelease'
                    ? `Force release ${confirmAction.account.name}?`
                    : `Revoke session for ${confirmAction.account.name}?`}
                </h2>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  {confirmAction.type === 'delete'
                    ? `Are you sure you want to remove "${confirmAction.account.name}" from the pool? This cannot be undone.`
                    : confirmAction.type === 'forceRelease'
                    ? `This will immediately make the account available, which may interrupt an active game session.`
                    : `This removes stored login credentials. Operators will need to sign in again before launching.`}
                </p>
              </div>
              <button
                type="button"
                className="icon-button h-9 w-9"
                onClick={() => setConfirmAction(null)}
                disabled={saving}
                aria-label="Close"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={saving}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 text-xs font-medium text-slate-300 transition hover:bg-white/[0.06]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  const { type, account } = confirmAction
                  setSaving(true)
                  try {
                    if (type === 'delete') {
                      await api.deleteAccount(account.id)
                      onToast(`Account ${account.name} removed`)
                    } else if (type === 'forceRelease') {
                      await api.forceReleaseAccount(account.id)
                      onToast(`Account ${account.name} force-released`)
                    } else if (type === 'clearSession') {
                      await api.deleteSessionBlob(account.id)
                      onToast(`Session token revoked for ${account.name}`)
                    }
                    setConfirmAction(null)
                    await refresh()
                  } catch (error) {
                    onToast(error instanceof ApiError ? error.message : 'Action failed')
                  } finally {
                    setSaving(false)
                  }
                }}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/15 px-4 text-xs font-medium text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Processing…' : 'Confirm'}
              </button>
            </div>
          </GlassCard>
        </div>
      ) : null}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{label}</span>{children}</label> }
