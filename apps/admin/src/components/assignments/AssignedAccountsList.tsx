import { Trash2, UserCheck, Users } from 'lucide-react'
import type { DashboardAccount } from '@laap/types'
import { GlassCard } from '../GlassCard'
import { StatusBadge } from '../StatusBadge'
import { assignmentStatusLabel } from '../../lib/labels'
import type { AssignmentRow } from './types'

type AssignedAccountsListProps = {
  userName: string
  assignments: AssignmentRow[]
  accounts: DashboardAccount[]
  onRevoke: (accountId: string, userId: string, accountName: string) => Promise<void>
  revokingKey: string | null
  offline: boolean
}

export function AssignedAccountsList({
  userName,
  assignments,
  accounts,
  onRevoke,
  revokingKey,
  offline,
}: AssignedAccountsListProps) {
  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="section-icon section-icon-cyan">
            <UserCheck size={16} />
          </span>
          <div>
            <h3 className="section-title">
              Accounts Accessible by {userName}
            </h3>
            <p className="text-xs text-slate-500">
              This person can use these accounts in LAAP Desktop.
            </p>
          </div>
        </div>
        <span className="font-mono text-xs text-slate-500">
          {assignments.length} total
        </span>
      </div>

      <div className="divide-y divide-white/[0.04]">
        {assignments.map((assignment) => {
          const acc = accounts.find((a) => a.id === assignment.accountId)
          const key = `${assignment.accountId}-${assignment.userId}`
          const isRevoking = revokingKey === key
          const isActive = assignment.status === 'active'

          return (
            <div
              key={assignment.id}
              className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition hover:bg-white/[0.015] sm:px-6"
            >
              <div className="flex items-center gap-3.5">
                <div className="account-glyph account-glyph-violet font-mono text-xs">
                  {acc?.region ?? assignment.account.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm font-semibold text-slate-100">
                      {assignment.account}
                    </p>
                    <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-mono font-medium text-slate-300">
                      {acc?.region ?? 'GLOBAL'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Assigned {new Date(assignment.assignedAt).toLocaleDateString()}
                    {assignment.expiresAt
                      ? ` · Expires ${new Date(assignment.expiresAt).toLocaleDateString()}`
                      : ' · Permanent access'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <StatusBadge value={assignmentStatusLabel(assignment.status)} compact />

                <button
                  type="button"
                  onClick={() => onRevoke(assignment.accountId, assignment.userId, assignment.account)}
                  disabled={!isActive || isRevoking || offline}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:border-rose-500/40 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Remove this account from user"
                >
                  <Trash2 size={13} />
                  <span>{isRevoking ? 'Removing…' : 'Remove Access'}</span>
                </button>
              </div>
            </div>
          )
        })}

        {!assignments.length ? (
          <div className="p-10 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.03] text-slate-500">
              <Users size={22} />
            </div>
            <h4 className="mt-3 text-sm font-semibold text-slate-300">
              No accounts assigned to {userName}
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              Use the form above to grant {userName} access to accounts from the pool.
            </p>
          </div>
        ) : null}
      </div>
    </GlassCard>
  )
}
