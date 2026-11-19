import { useState } from 'react'
import {
  Check,
  Clock,
  Copy,
  CreditCard,
  History,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { GlassCard } from '../components/GlassCard'
import { formatDateTime } from '../lib/labels'
import type { AuditData } from '../lib/types'

type AuditPageProps = {
  data: AuditData | null
  loading: boolean
  onRefresh: () => void
  onToast: (msg: string) => void
}

export function AuditPage({ data, loading, onRefresh, onToast }: AuditPageProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text)
    setCopiedId(id)
    onToast(`Copied ${text}`)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const transactions = data?.transactions ?? []
  const gifts = data?.gifts ?? []

  return (
    <div className="space-y-6">
      {/* Paddle Transactions Feed */}
      <GlassCard className="overflow-hidden">
        <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CreditCard className="text-cyan-400" size={18} />
            <div>
              <p className="eyebrow">Payment Gateway</p>
              <h2 className="text-lg font-semibold text-slate-100">
                Paddle Transactions & Webhook Events ({transactions.length})
              </h2>
            </div>
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
                <th className="py-3 px-4">Transaction ID</th>
                <th className="py-3 px-4">Customer ID</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-slate-300">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    {loading ? 'Fetching transactions from Paddle...' : 'No Paddle transactions recorded yet.'}
                  </td>
                </tr>
              ) : (
                transactions.map((txn) => {
                  const amount = txn.details?.totals?.grand_total
                    ? `$${(Number(txn.details.totals.grand_total) / 100).toFixed(2)}`
                    : '—'

                  return (
                    <tr key={txn.id} className="hover:bg-white/[0.015] transition">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 font-mono text-slate-200">
                          <span>{txn.id}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(txn.id, txn.id)}
                            className="text-slate-500 hover:text-slate-300 transition"
                            title="Copy Transaction ID"
                          >
                            {copiedId === txn.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                          </button>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        {txn.customer_id || '—'}
                      </td>

                      <td className="py-3.5 px-4">
                        {txn.status === 'completed' || txn.status === 'billed' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300 border border-emerald-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            {txn.status}
                          </span>
                        ) : txn.status === 'past_due' || txn.status === 'refunded' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-medium text-rose-300 border border-rose-500/20">
                            {txn.status}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-300 border border-amber-500/20">
                            {txn.status}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-200">
                        {amount} {txn.currency_code ?? 'USD'}
                      </td>

                      <td className="py-3.5 px-4 text-slate-400">
                        {formatDateTime(txn.created_at)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Code & Grant Audit Feed */}
      <GlassCard className="overflow-hidden">
        <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <History className="text-violet-400" size={18} />
            <div>
              <p className="eyebrow">Audit Trail</p>
              <h2 className="text-lg font-semibold text-slate-100">
                Grant Lifecycle & Redemptions
              </h2>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/[0.06] bg-white/[0.02] text-slate-400 font-medium">
              <tr>
                <th className="py-3 px-4">Event Target</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Recipient</th>
                <th className="py-3 px-4">Redeemed At</th>
                <th className="py-3 px-4">Revocation Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-slate-300">
              {gifts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    No grant history available.
                  </td>
                </tr>
              ) : (
                gifts.map((g) => (
                  <tr key={g.id} className="hover:bg-white/[0.015] transition">
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      gift:{g.id.slice(0, 8)}...
                    </td>
                    <td className="py-3.5 px-4 capitalize text-slate-200 font-medium">
                      {g.duration}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-cyan-300">
                      {g.recipient || 'Open'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {g.redeemed_at ? formatDateTime(g.redeemed_at) : 'Not redeemed yet'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {g.revoked_at ? (
                        <span className="text-rose-400">{formatDateTime(g.revoked_at)}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  )
}
