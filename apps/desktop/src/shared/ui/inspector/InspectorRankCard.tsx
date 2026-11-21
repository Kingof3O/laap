import { Activity, Play } from 'lucide-react'
import type { Game } from '../../../lib/types.ts'
import { getRankTierClass } from '../../../lib/sorting.ts'
import { RankCrest } from '../RankPicker.tsx'
import { InspectorIconButton } from './InspectorIconButton.tsx'

export function InspectorRankCard({
  rank,
  displayRankWithScore,
  activeGame,
  onLaunch,
  sessionReady,
  busy,
  name,
  launchLabel,
  canCheckLive,
  onCheckLive,
  checkingLive,
}: {
  rank: string
  displayRankWithScore: string
  activeGame: Game
  onLaunch?: () => void
  sessionReady: boolean
  busy?: boolean
  name: string
  launchLabel?: string
  canCheckLive?: boolean
  onCheckLive?: () => void
  checkingLive?: boolean
}) {
  return (
    <>
      <div className={`inspector-rank ${getRankTierClass(rank)}`}>
        <div className="inspector-crest">
          <RankCrest rank={rank} game={activeGame} />
        </div>
        <div className="inspector-rank-copy">
          <span className="inspector-meta-label">Rank</span>
          <strong>{displayRankWithScore}</strong>
        </div>
      </div>

      {(onLaunch && sessionReady) || canCheckLive ? (
        <div className="inspector-session">
          <div className="inspector-session-actions">
            {onLaunch && sessionReady ? (
              <button
                className="inspector-launch-btn"
                type="button"
                onClick={onLaunch}
                disabled={busy}
                aria-label={`Launch ${name}`}
              >
                <Play size={14} fill="currentColor" aria-hidden="true" />
                {launchLabel === 'Switch' ? 'Switch account' : 'Launch session'}
              </button>
            ) : null}
            {canCheckLive ? (
              <InspectorIconButton
                label={`Check live match status for ${name}`}
                title="Check live match"
                onClick={onCheckLive}
                disabled={busy || checkingLive}
              >
                <Activity size={15} />
              </InspectorIconButton>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
