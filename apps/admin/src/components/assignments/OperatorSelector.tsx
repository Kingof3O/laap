import { Search } from 'lucide-react'
import type { ApiUser } from '@laap/types'
import { initials } from '../../lib/labels'
import { GlassCard } from '../GlassCard'

type OperatorSelectorProps = {
  users: ApiUser[]
  selectedUserId: string
  onSelectUser: (userId: string) => void
  search: string
  onSearchChange: (search: string) => void
  getAssignmentCount: (userId: string) => number
}

export function OperatorSelector({
  users,
  selectedUserId,
  onSelectUser,
  search,
  onSearchChange,
  getAssignmentCount,
}: OperatorSelectorProps) {
  return (
    <GlassCard className="flex flex-col overflow-hidden p-0">
      <div className="border-b border-white/[0.06] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Operators ({users.length})
          </h2>
          <span className="text-[11px] text-slate-500">Select to view</span>
        </div>
        <div className="relative mt-3">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            type="text"
            placeholder="Filter users..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input-base h-9 w-full pl-8 pr-3 text-xs"
          />
        </div>
      </div>

      <div className="max-h-[600px] divide-y divide-white/[0.04] overflow-y-auto">
        {users.map((user) => {
          const count = getAssignmentCount(user.id)
          const isSelected = selectedUserId === user.id
          return (
            <button
              key={user.id}
              type="button"
              onClick={() => onSelectUser(user.id)}
              className={`flex w-full cursor-pointer items-center gap-3 p-3.5 text-left transition ${
                isSelected
                  ? 'border-l-2 border-cyan-400 bg-cyan-400/[0.08]'
                  : 'hover:bg-white/[0.025]'
              }`}
            >
              <div className={`avatar ${isSelected ? 'avatar-cyan' : 'avatar-indigo'}`}>
                {initials(user.displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-xs font-semibold ${isSelected ? 'text-cyan-100' : 'text-slate-200'}`}>
                  {user.displayName}
                </p>
                <p className="truncate text-[11px] text-slate-500">{user.email}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${
                  count > 0 ? 'bg-cyan-400/15 text-cyan-200' : 'bg-white/[0.04] text-slate-500'
                }`}
              >
                {count} {count === 1 ? 'account' : 'accounts'}
              </span>
            </button>
          )
        })}

        {!users.length ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No operators found.
          </div>
        ) : null}
      </div>
    </GlassCard>
  )
}
