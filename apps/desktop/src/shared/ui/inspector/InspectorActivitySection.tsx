import { useEffect, useState } from 'react'
import { Clock3, History, RotateCcw, Sparkles } from 'lucide-react'
import type { RosterItem } from '../AccountRosterDisplay.tsx'
import { formatLiveMatchLabel } from '../../../lib/liveStatus.ts'
import { getActivityLog, type ActivityEvent } from '../../../lib/activityLog.ts'

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
  const [events, setEvents] = useState<ActivityEvent[]>([])

  useEffect(() => {
    const update = () => {
      setEvents(getActivityLog(account.id).slice(0, 3))
    }
    update()
    window.addEventListener('laap:activity-updated', update)
    return () => window.removeEventListener('laap:activity-updated', update)
  }, [account.id])

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

      {/* Recent Local Timeline Log */}
      {events.length > 0 ? (
        <div className="inspector-activity-timeline" aria-label="Recent local session timeline">
          <span className="inspector-activity-timeline-title">
            <History size={11} aria-hidden="true" /> Recent Events
          </span>
          <ul className="inspector-activity-events">
            {events.map((evt) => (
              <li key={evt.id} className="inspector-activity-event-item">
                <span className="inspector-activity-event-dot" />
                <span className="inspector-activity-event-detail">{evt.detail}</span>
                <time className="inspector-activity-event-time">
                  {new Date(evt.timestamp).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
