import type { ReactNode } from 'react'
import { PanelRightOpen } from 'lucide-react'
import type { Game, ViewMode } from '../../../lib/types.ts'
import { AccountCardSkeleton } from './AccountCardSkeleton.tsx'
import { AccountRowSkeleton } from './AccountRowSkeleton.tsx'
import { InspectorSkeleton } from './InspectorSkeleton.tsx'

export function RosterWorkspaceSkeleton({
  viewMode = 'grid',
  activeGame = 'league',
  detailsOpen = true,
  onToggleDetails,
  toolbarSlot,
  className = '',
}: {
  viewMode?: ViewMode
  activeGame?: Game
  detailsOpen?: boolean
  onToggleDetails?: () => void
  toolbarSlot?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`roster-viewport roster-viewport-skeleton ${className}`}
      role="status"
      aria-label="Loading account roster"
      aria-busy="true"
    >
      <span className="sr-only">Loading profiles…</span>

      {viewMode === 'grid' ? (
        <div className="roster-heading">
          <div>
            <span className="roster-kicker">
              {activeGame === 'valorant' ? 'YOUR VALORANT ACCOUNTS' : 'YOUR LEAGUE ACCOUNTS'}
            </span>
            <h1>Choose your next session</h1>
          </div>
          <div className="roster-heading-actions">
            {toolbarSlot}
            {onToggleDetails ? (
              <button
                type="button"
                className="details-toggle"
                aria-expanded={detailsOpen}
                aria-controls="profile-inspector"
                onClick={onToggleDetails}
              >
                <PanelRightOpen size={16} />
                {detailsOpen ? 'Hide details' : 'Show details'}
              </button>
            ) : null}
          </div>
        </div>
      ) : toolbarSlot ? (
        <div className="roster-list-utility">{toolbarSlot}</div>
      ) : null}

      {viewMode === 'grid' ? (
        <div className={detailsOpen ? 'roster-workspace' : 'roster-workspace roster-workspace-full'}>
          <div className="roster-grid" role="region" aria-label="Loading accounts">
            <AccountCardSkeleton />
            <AccountCardSkeleton />
          </div>
          {detailsOpen ? <InspectorSkeleton isVal={activeGame === 'valorant'} /> : null}
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="roster-table">
            <thead>
              <tr>
                <th>
                  <span className="table-header-btn">
                    <span>Summoner Profile</span>
                  </span>
                </th>
                <th>
                  <span className="table-header-btn">
                    <span>Rank</span>
                  </span>
                </th>
                <th>
                  <span className="table-header-btn">
                    <span>Region</span>
                  </span>
                </th>
                <th>
                  <span className="table-header-btn">
                    <span>Status</span>
                  </span>
                </th>
                <th>
                  <span className="table-header-btn">
                    <span>Last played</span>
                  </span>
                </th>
                <th>
                  <span className="table-header-btn" style={{ justifyContent: 'flex-end' }}>
                    <span>Actions</span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4].map((index) => (
                <AccountRowSkeleton key={index} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
