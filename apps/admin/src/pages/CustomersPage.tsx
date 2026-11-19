import { useState } from 'react'
import {
  Check,
  Clock,
  Copy,
  Laptop,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  X,
  Zap,
} from 'lucide-react'
import { GlassCard } from '../components/GlassCard'
import { api } from '../lib/api'
import { formatDate, initials } from '../lib/labels'
import type { Customer } from '../lib/types'

type CustomersPageProps = {
  customers: Customer[]
  loading: boolean
  onRefresh: () => void
  onToast: (msg: string) => void
}

export function CustomersPage({ customers, loading, onRefresh, onToast }: CustomersPageProps) {
  const [query, setQuery] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Modals state
  const [overrideCustomer, setOverrideCustomer] = useState<Customer | null>(null)
  const [overrideReason, setOverrideReason] = useState('Hardware upgrade / support override')
  const [submittingOverride, setSubmittingOverride] = useState(false)

  const [grantCustomer, setGrantCustomer] = useState<Customer | null>(null)
  const [grantDuration, setGrantDuration] = useState<'month' | 'year' | 'lifetime'>('year')
  const [submittingGrant, setSubmittingGrant] = useState(false)

  const [revokeCustomer, setRevokeCustomer] = useState<Customer | null>(null)
  const [submittingRevoke, setSubmittingRevoke] = useState(false)

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text)
    setCopiedId(id)
    onToast(`Copied ${text}`)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!overrideCustomer) return
    setSubmittingOverride(true)
    try {
      await api.transferOverride({
        buyer: overrideCustomer.email,
        reason: overrideReason.trim(),
      })
      onToast(`Transfer override authorized for ${overrideCustomer.email}`)
      setOverrideCustomer(null)
      onRefresh()
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Could not authorize transfer override.')
    } finally {
      setSubmittingOverride(false)
    }
  }

  const handleGrantSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!grantCustomer) return
    setSubmittingGrant(true)
    try {
      await api.grantPro({
        buyerId: grantCustomer.id,
        email: grantCustomer.email,
        duration: grantDuration,
      })
      onToast(`Granted ${grantDuration} Pro to ${grantCustomer.email}!`)
      setGrantCustomer(null)
      onRefresh()
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Could not grant Pro.')
    } finally {
      setSubmittingGrant(false)
    }
  }

  const handleRevokeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!revokeCustomer) return
    setSubmittingRevoke(true)
    try {
      await api.revokePro({
        buyerId: revokeCustomer.id,
        giftId: revokeCustomer.giftId || undefined,
      })
      onToast(`Revoked Pro for ${revokeCustomer.email}`)
      setRevokeCustomer(null)
      onRefresh()
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Could not revoke Pro.')
    } finally {
      setSubmittingRevoke(false)
    }
  }

  const filtered = customers.filter(
    (c) =>
      c.email.toLowerCase().includes(query.toLowerCase()) ||
      c.id.toLowerCase().includes(query.toLowerCase()) ||
      c.plan.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <GlassCard className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by email, user ID, or plan..."
              className="input-base h-10 w-full pl-9 pr-3 text-xs sm:text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="btn-secondary flex h-10 items-center gap-1.5 px-3 text-xs font-medium rounded-xl"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Customer Directory Table */}
      <GlassCard className="overflow-hidden">
        <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <p className="eyebrow">Directory</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-100">
              Registered Accounts ({filtered.length})
            </h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/[0.06] bg-white/[0.02] text-slate-400 font-medium">
              <tr>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Pro Status</th>
                <th className="py-3 px-4">Plan / Source</th>
                <th className="py-3 px-4">Expiry / Renewal</th>
                <th className="py-3 px-4">Registered</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-slate-300">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    {loading ? 'Loading registered customers...' : 'No matching customer accounts found.'}
                  </td>
                </tr>
              ) : (
                filtered.map((customer) => {
                  return (
                    <tr key={customer.id} className="hover:bg-white/[0.015] transition">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="avatar avatar-indigo">{initials(customer.email)}</div>
                          <div>
                            <div className="flex items-center gap-1.5 font-medium text-slate-200">
                              <span>{customer.email}</span>
                              {customer.confirmedAt ? (
                                <span title="Email verified">
                                  <Check size={13} className="text-emerald-400" />
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1 text-[11px] font-mono text-slate-500">
                              <span>{customer.id.slice(0, 8)}...</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(customer.id, customer.id)}
                                className="text-slate-500 hover:text-slate-300 transition"
                                title="Copy UUID"
                              >
                                {copiedId === customer.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {customer.hasPro ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 border border-emerald-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Pro Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-2.5 py-1 text-[11px] font-medium text-slate-400 border border-slate-500/20">
                            Free / Inactive
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="capitalize font-mono text-slate-300">
                          {customer.plan === 'none' ? '—' : customer.plan}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        {customer.endsAt ? formatDate(customer.endsAt) : customer.hasPro ? 'Lifetime / Auto-renew' : '—'}
                      </td>

                      <td className="py-3.5 px-4 text-slate-500">
                        {formatDate(customer.createdAt)}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Transfer Override button */}
                          <button
                            type="button"
                            onClick={() => setOverrideCustomer(customer)}
                            className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1.5 text-[11px] font-medium text-cyan-200 hover:bg-cyan-400/20 transition flex items-center gap-1"
                            title="Authorize PC Transfer Override (bypasses 30-day lock)"
                          >
                            <Laptop size={12} />
                            <span>Transfer Override</span>
                          </button>

                          {/* Grant or Revoke button */}
                          {customer.hasPro ? (
                            <button
                              type="button"
                              onClick={() => setRevokeCustomer(customer)}
                              className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-2.5 py-1.5 text-[11px] font-medium text-rose-200 hover:bg-rose-400/20 transition"
                            >
                              Revoke
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setGrantCustomer(customer)}
                              className="rounded-lg border border-violet-400/20 bg-violet-400/10 px-2.5 py-1.5 text-[11px] font-medium text-violet-200 hover:bg-violet-400/20 transition flex items-center gap-1"
                            >
                              <Plus size={12} />
                              <span>Grant Pro</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* PC Transfer Override Modal */}
      {overrideCustomer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <GlassCard className="w-full max-w-md p-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.07]">
              <div className="flex items-center gap-2">
                <Laptop className="text-cyan-400" size={18} />
                <h3 className="text-base font-semibold text-slate-100">PC Transfer Override</h3>
              </div>
              <button
                type="button"
                onClick={() => setOverrideCustomer(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleOverrideSubmit} className="mt-4 space-y-4">
              <p className="text-xs text-slate-400 leading-relaxed">
                Authorizes a 2-day override window for{' '}
                <strong className="text-slate-200">{overrideCustomer.email}</strong> to transfer their Pro license to a new PC, bypassing the 30-day cooling-off limit.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="reason">
                  Support Reason (recorded in audit log)
                </label>
                <input
                  id="reason"
                  type="text"
                  maxLength={200}
                  required
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="input-base h-10 w-full px-3 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setOverrideCustomer(null)}
                  disabled={submittingOverride}
                  className="btn-secondary px-3.5 py-2 text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingOverride || !overrideReason.trim()}
                  className="btn-primary px-3.5 py-2 text-xs rounded-xl"
                >
                  {submittingOverride ? 'Authorizing...' : 'Authorize Override'}
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      ) : null}

      {/* Grant Pro Modal */}
      {grantCustomer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <GlassCard className="w-full max-w-md p-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.07]">
              <div className="flex items-center gap-2">
                <Zap className="text-violet-400" size={18} />
                <h3 className="text-base font-semibold text-slate-100">Grant Pro License</h3>
              </div>
              <button
                type="button"
                onClick={() => setGrantCustomer(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleGrantSubmit} className="mt-4 space-y-4">
              <p className="text-xs text-slate-400 leading-relaxed">
                Directly grant Pro access to <strong className="text-slate-200">{grantCustomer.email}</strong>. This generates an internal license grant that activates immediately.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="duration">
                  License Duration
                </label>
                <select
                  id="duration"
                  value={grantDuration}
                  onChange={(e) => setGrantDuration(e.target.value as 'month' | 'year' | 'lifetime')}
                  className="input-base h-10 w-full px-3 text-xs bg-slate-900"
                >
                  <option value="month">30 Days (Month)</option>
                  <option value="year">1 Year (Yearly)</option>
                  <option value="lifetime">Lifetime License</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setGrantCustomer(null)}
                  disabled={submittingGrant}
                  className="btn-secondary px-3.5 py-2 text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingGrant}
                  className="btn-primary px-3.5 py-2 text-xs rounded-xl"
                >
                  {submittingGrant ? 'Granting Pro...' : 'Confirm Grant'}
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      ) : null}

      {/* Revoke Pro Modal */}
      {revokeCustomer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <GlassCard className="w-full max-w-md p-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.07]">
              <div className="flex items-center gap-2">
                <ShieldAlert className="text-rose-400" size={18} />
                <h3 className="text-base font-semibold text-slate-100">Revoke Pro License</h3>
              </div>
              <button
                type="button"
                onClick={() => setRevokeCustomer(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleRevokeSubmit} className="mt-4 space-y-4">
              <p className="text-xs text-rose-300/90 leading-relaxed">
                Are you sure you want to revoke Pro from{' '}
                <strong className="text-slate-100">{revokeCustomer.email}</strong>? They will lose access to Pro features upon their next license refresh.
              </p>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setRevokeCustomer(null)}
                  disabled={submittingRevoke}
                  className="btn-secondary px-3.5 py-2 text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRevoke}
                  className="btn-danger px-3.5 py-2 text-xs rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium"
                >
                  {submittingRevoke ? 'Revoking...' : 'Revoke License'}
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      ) : null}
    </div>
  )
}
