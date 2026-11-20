import type { ReactNode } from 'react'

export function SeasonRecord({
  wins = 0,
  losses = 0,
  fallback = null,
}: {
  wins?: number
  losses?: number
  fallback?: ReactNode
}) {
  if (!Number.isSafeInteger(wins) || wins < 0 ||
      !Number.isSafeInteger(losses) || losses < 0 || wins + losses === 0) {
    return fallback
  }
  const winPercentage = (wins / (wins + losses)) * 100

  return (
    <div className="season-record">
      <div className="season-record-label">
        <span><strong>{Math.round(winPercentage)}%</strong> win rate</span>
        <span title={`${wins} wins, ${losses} losses`}>
          <span className="season-record-wins">{wins}W</span>{' · '}{losses}L
        </span>
      </div>
      <div className="season-record-bar" aria-hidden="true">
        <span style={{ width: `${winPercentage}%` }} />
      </div>
    </div>
  )
}
