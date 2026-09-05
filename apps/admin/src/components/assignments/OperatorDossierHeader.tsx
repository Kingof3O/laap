import type { ApiUser } from '@laap/types'
import { initials } from '../../lib/labels'

type OperatorDossierHeaderProps = {
  user: ApiUser
  activeAssignmentsCount: number
}

export function OperatorDossierHeader({ user, activeAssignmentsCount }: OperatorDossierHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3.5">
        <div className="avatar avatar-cyan h-12 w-12 text-sm">
          {initials(user.displayName)}
        </div>
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-slate-100">{user.displayName}</h2>
            <span className="rounded bg-cyan-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-200">
              {user.role}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">{user.email}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-right">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Assigned accounts
          </p>
          <p className="font-mono text-lg font-bold text-cyan-200">{activeAssignmentsCount}</p>
        </div>
      </div>
    </div>
  )
}
