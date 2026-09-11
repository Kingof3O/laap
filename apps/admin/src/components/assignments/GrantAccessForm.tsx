import { useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import type { DashboardAccount } from '@laap/types'

type GrantAccessFormProps = {
  userName: string
  availableAccounts: DashboardAccount[]
  onGrant: (accountIds: string[], expiresAt: string | null) => Promise<void>
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
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [expiresAt, setExpiresAt] = useState('')
  const [filterQuery, setFilterQuery] = useState('')

  const toggleAccount = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const selectAll = () => {
    if (selectedIds.length === filteredAccounts.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredAccounts.map((a) => a.id))
    }
  }

  const filteredAccounts = useMemo(() => {
    if (!filterQuery.trim()) return availableAccounts
    const q = filterQuery.toLowerCase()
    return availableAccounts.filter(
      (a) => a.name.toLowerCase().includes(q) || a.region.toLowerCase().includes(q)
    )
  }, [availableAccounts, filterQuery])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (selectedIds.length === 0) return
    await onGrant(selectedIds, expiresAt ? new Date(expiresAt).toISOString() : null)
    setSelectedIds([])
    setExpiresAt('')
  }

  return (
    <div className="mt-6 border-t border-white/[0.06] pt-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <Plus size={14} className="text-cyan-400" />
          <span>Grant Account Access to {userName}</span>
        </div>
        {availableAccounts.length > 1 ? (
          <button
            type="button"
            onClick={selectAll}
            className="text-[11px] text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
          >
            {selectedIds.length === filteredAccounts.length ? 'Deselect all' : 'Select all'}
          </button>
        ) : null}
      </div>

      <form className="mt-3.5 space-y-3" onSubmit={handleSubmit}>
        {availableAccounts.length > 5 ? (
          <input
            type="text"
            placeholder="Filter accounts…"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="input-base h-8 w-full px-2.5 text-xs"
          />
        ) : null}

        <div className="max-h-48 overflow-y-auto rounded-xl border border-white/[0.08] bg-white/[0.02] p-2 space-y-1">
          {filteredAccounts.length === 0 ? (
            <p className="p-3 text-center text-xs text-slate-500">
              {availableAccounts.length === 0 ? 'No accounts available to grant.' : 'No accounts match filter.'}
            </p>
          ) : (
            filteredAccounts.map((acc) => {
              const checked = selectedIds.includes(acc.id)
              return (
                <label
                  key={acc.id}
                  className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition text-xs ${
                    checked ? 'bg-cyan-400/10 border border-cyan-400/20 text-cyan-200' : 'hover:bg-white/[0.04] text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAccount(acc.id)}
                      className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 text-cyan-400 focus:ring-0 cursor-pointer"
                    />
                    <span className="font-mono">{acc.name}</span>
                  </div>
                  <span className="text-[11px] text-slate-500">{acc.region}</span>
                </label>
              )
            })
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end pt-1">
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
            disabled={saving || offline || selectedIds.length === 0}
            className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-400/15 px-4 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Granting…' : selectedIds.length > 1 ? `Grant Access (${selectedIds.length})` : 'Grant Access'}
            <ArrowRight size={13} />
          </button>
        </div>
      </form>
    </div>
  )
}
