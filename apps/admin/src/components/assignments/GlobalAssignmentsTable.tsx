import { Link2, Trash2 } from 'lucide-react'
import { GlassCard } from '../GlassCard'
import { StatusBadge } from '../StatusBadge'
import { assignmentStatusLabel } from '../../lib/labels'
import type { AssignmentRow } from './types'

type GlobalAssignmentsTableProps = {
  assignments: AssignmentRow[]
  onRevoke: (accountId: string, userId: string, accountName: string, userName: string) => Promise<void>
  revokingKey: string | null
  offline: boolean
}

export function GlobalAssignmentsTable({
  assignments,
  onRevoke,
  revokingKey,
  offline,
}: GlobalAssignmentsTableProps) {
  const activeCount = assignments.filter((r) => r.status === 'active').length

  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-5 sm:px-6">
        <span className="section-icon section-icon-violet">
          <Link2 size={16} />
        </span>
        <div>
          <h2 className="section-title">
            Everyone's access{' '}
            <span className="font-mono text-[11px] text-slate-500">
              ({activeCount} active)
            </span>
          </h2>
          <p className="mt-1 text-xs text-slate-500">See which accounts each person can use.</p>
        </div>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {assignments.map((row) => {
          const key = `${row.accountId}-${row.userId}`
          const isRevoking = revokingKey === key
          const isActive = row.status === 'active'

          return (
            <div key={row.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
              <div className="account-glyph account-glyph-violet font-mono text-xs" aria-hidden="true">
                {row.account.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-[170px] flex-1">
                <p className="font-mono text-xs font-semibold text-slate-200">{row.account}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {row.user} · {row.email}
                </p>
              </div>
              <StatusBadge value={assignmentStatusLabel(row.status)} compact />
              <button
                type="button"
                onClick={() => onRevoke(row.accountId, row.userId, row.account, row.user)}
                disabled={!isActive || isRevoking || offline}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 transition hover:border-rose-500/40 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={13} />
                <span>{isRevoking ? 'Removing…' : 'Remove access'}</span>
              </button>
            </div>
          )
        })}
        {!assignments.length ? (
          <p className="px-6 py-10 text-center text-xs text-slate-500">No one has been given access yet.</p>
        ) : null}
      </div>
    </GlassCard>
  )
}
