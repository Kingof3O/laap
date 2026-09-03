import { useState, type FormEvent } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import type { DashboardAccount } from '@laap/types'

type GrantAccessFormProps = {
  userName: string
  availableAccounts: DashboardAccount[]
  onGrant: (accountId: string, expiresAt: string | null) => Promise<void>
  saving: boolean
  offline: boolean
}

export function GrantAccessForm({
  userName,
  availableAccounts,
  onGrant,
  saving,
  offline,
}: GrantAccessFormProps) {
  const [accountId, setAccountId] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!accountId) return
    await onGrant(accountId, expiresAt ? new Date(expiresAt).toISOString() : null)
    setAccountId('')
    setExpiresAt('')
  }

  return (
    <div className="mt-6 border-t border-white/[0.06] pt-5">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
        <Plus size={14} className="text-cyan-400" />
        <span>Grant Account Access to {userName}</span>
      </div>

      <form className="mt-3.5 grid gap-3 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
            Choose Account
          </span>
          <select
            className="input-base h-10 w-full cursor-pointer px-3 text-xs"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
          >
            <option value="">Select an account to grant…</option>
            {availableAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name} · {acc.region} ({acc.status})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
            Access Expiration (Optional)
          </span>
          <input
            className="input-base h-10 w-full px-3 text-xs"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </label>

        <button
          type="submit"
          disabled={saving || offline || !accountId}
          className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-400/15 px-4 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Granting…' : 'Grant Access'}
          <ArrowRight size={13} />
        </button>
      </form>
    </div>
  )
}
