import { useState } from 'react'
import {
  Check,
  Copy,
  Gift,
  Mail,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { GlassCard } from '../components/GlassCard'
import { api } from '../lib/api'
import { formatDate, formatDateTime } from '../lib/labels'
import type { GiftCode } from '../lib/types'

type GiftsPageProps = {
  gifts: GiftCode[]
  loading: boolean
  onRefresh: () => void
  onToast: (msg: string) => void
}

export function GiftsPage({ gifts, loading, onRefresh, onToast }: GiftsPageProps) {
  // Generator state
  const [duration, setDuration] = useState<'month' | 'year' | 'lifetime'>('year')
  const [recipient, setRecipient] = useState('')
  const [generating, setGenerating] = useState(false)
  const [newCode, setNewCode] = useState<{ code: string; redeemBy: string } | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)

  // Revoke state
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    setGenerating(true)
    try {
      const res = await api.createGift({
        duration,
        recipient: recipient.trim() || undefined,
      })
      setNewCode({ code: res.code, redeemBy: res.redeemBy })
      onToast(`Generated new ${duration} code: ${res.code}`)
      onRefresh()
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Could not generate gift code.')
    } finally {
      setGenerating(false)
    }
  }

  const handleCopyCode = (code: string) => {
    void navigator.clipboard.writeText(code)
    setCopiedCode(true)
    onToast(`Copied ${code} to clipboard!`)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  const handleRevoke = async (id: string) => {
    setRevokingId(id)
    try {
      await api.revokeGift(id)
      onToast('Gift code revoked successfully.')
      onRefresh()
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Failed to revoke code.')
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Code Generator Form Card */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-2">
          <Gift className="text-amber-400" size={20} />
          <div>
            <p className="eyebrow">Generator</p>
            <h2 className="text-lg font-semibold text-slate-100">Create Gift or Promo Code</h2>
          </div>
        </div>

        <form onSubmit={handleGenerate} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="duration">
              Duration
            </label>
            <select
              id="duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value as 'month' | 'year' | 'lifetime')}
              className="input-base h-11 w-full px-3 text-xs bg-slate-900"
            >
              <option value="month">30 Days (Month)</option>
              <option value="year">1 Year (Yearly)</option>
              <option value="lifetime">Lifetime License</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="recipient">
              Recipient Email (Optional restriction)
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
              <input
                id="recipient"
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Leave blank for any recipient"
                className="input-base h-11 w-full pl-9 pr-3 text-xs"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={generating}
              className="btn-primary flex h-11 w-full items-center justify-center gap-1.5 px-4 text-xs font-medium rounded-xl"
            >
              {generating ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>Generate Code</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Success Banner when code is generated */}
        {newCode ? (
          <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                  New Code Created! Share with customer:
                </p>
                <p className="mt-1 font-mono text-xl sm:text-2xl font-bold tracking-wider text-slate-100 select-all">
                  {newCode.code}
                </p>
                <p className="mt-1 text-[11px] text-amber-200/80">
                  Must be redeemed by {formatDate(newCode.redeemBy)} via Desktop App or Checkout.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyCode(newCode.code)}
                  className="rounded-xl border border-amber-300/40 bg-amber-400/20 px-4 py-2.5 text-xs font-semibold text-amber-100 hover:bg-amber-400/30 transition flex items-center gap-1.5"
                >
                  {copiedCode ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewCode(null)}
                  className="icon-button text-slate-400 hover:text-slate-200"
                  aria-label="Dismiss banner"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </GlassCard>

      {/* Gift Codes History Table */}
      <GlassCard className="overflow-hidden">
        <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <p className="eyebrow">History</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-100">
              Generated Gift Codes ({gifts.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="btn-secondary flex h-9 items-center gap-1.5 px-3 text-xs font-medium rounded-xl"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/[0.06] bg-white/[0.02] text-slate-400 font-medium">
              <tr>
                <th className="py-3 px-4">Code ID</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Recipient</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Redeem Deadline</th>
                <th className="py-3 px-4">Redeemed At</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-slate-300">
              {gifts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    {loading ? 'Loading gift codes...' : 'No gift codes generated yet.'}
                  </td>
                </tr>
              ) : (
                gifts.map((g) => {
                  const isRevoked = !!g.revoked_at
                  const isRedeemed = !!g.redeemed_at
                  const isExpired = !isRedeemed && new Date(g.redeem_by).getTime() < Date.now()
                  const isActive = !isRevoked && !isExpired && !isRedeemed

                  return (
                    <tr key={g.id} className="hover:bg-white/[0.015] transition">
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {g.id.slice(0, 8)}...
                      </td>

                      <td className="py-3 px-4 capitalize font-medium text-slate-200">
                        {g.duration}
                      </td>

                      <td className="py-3 px-4">
                        {g.recipient ? (
                          <span className="text-cyan-300 font-mono text-[11px]">{g.recipient}</span>
                        ) : (
                          <span className="text-slate-500">Any buyer</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {isRevoked ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-medium text-rose-300 border border-rose-500/20">
                            Revoked
                          </span>
                        ) : isRedeemed ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-medium text-cyan-300 border border-cyan-500/20">
                            Redeemed
                          </span>
                        ) : isExpired ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-2.5 py-0.5 text-[11px] font-medium text-slate-400 border border-slate-500/20">
                            Expired
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300 border border-emerald-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Active
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-400">
                        {formatDate(g.redeem_by)}
                      </td>

                      <td className="py-3 px-4 text-slate-400">
                        {g.redeemed_at ? formatDateTime(g.redeemed_at) : '—'}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {!isRevoked && (isActive || isRedeemed) ? (
                          <button
                            type="button"
                            onClick={() => handleRevoke(g.id)}
                            disabled={revokingId === g.id}
                            className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-2.5 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-400/20 transition"
                          >
                            {revokingId === g.id ? 'Revoking...' : 'Revoke'}
                          </button>
                        ) : (
                          <span className="text-slate-600 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  )
}
