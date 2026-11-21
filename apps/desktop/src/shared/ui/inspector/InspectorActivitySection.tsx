import { Clock3 } from 'lucide-react'
import type { RosterItem } from '../AccountRosterDisplay.tsx'
import { formatLiveMatchLabel } from '../../../lib/liveStatus.ts'

export function InspectorActivitySection({
  account,
  isVal,
  canCheckLive,
  added,
}: {
  account: RosterItem
  isVal: boolean
  canCheckLive: boolean
  added: string | null
}) {
  return (
    <section className="inspector-section" aria-label="Activity">
      <div className="inspector-section-heading">
        <h3>
          <Clock3 size={14} aria-hidden="true" /> Activity
        </h3>
      </div>
      <dl className="inspector-details">
        {!isVal && (canCheckLive || account.liveStatus) ? (
          <div>
            <dt>Live match</dt>
            <dd
              className={
                account.liveStatus?.inGame
                  ? 'inspector-live-in-game'
                  : account.liveStatus && !account.liveStatus.checking
                    ? 'inspector-live-idle'
                    : undefined
              }
              aria-live="polite"
            >
              {formatLiveMatchLabel(account.liveStatus)}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Last played</dt>
          <dd>{account.lastUsedText || 'Never played'}</dd>
        </div>
        {added ? (
          <div>
            <dt>Profile added</dt>
            <dd>{added}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  )
}
