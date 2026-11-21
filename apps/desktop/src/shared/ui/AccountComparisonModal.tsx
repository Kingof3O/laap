import { useState } from 'react'
import { Check, ChevronDown, Play, Sparkles, Trophy, X } from 'lucide-react'
import type { Game, LocalAccountSummary } from '../../lib/types.ts'
import { RankCrest } from './RankPicker.tsx'
import { CardTopChampions } from './CardTopChampions.tsx'
import { getOpggCachedStats } from '../../lib/opgg.ts'
import { getRankTierClass } from '../../lib/sorting.ts'
import { playHextechLaunch, playHextechSelect } from '../../lib/soundEffects.ts'

export function AccountComparisonModal({
  isOpen,
  onClose,
  accounts,
  activeGame,
  onLaunchAccount,
}: {
  isOpen: boolean
  onClose: () => void
  accounts: LocalAccountSummary[]
  activeGame: Game
  onLaunchAccount: (id: string, game?: Game) => void
}) {
  const gameAccounts = accounts.filter(
    (a) => (a.games && a.games.length > 0 ? a.games : ['league']).includes(activeGame),
  )

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    gameAccounts.slice(0, 3).map((a) => a.id),
  )

  if (!isOpen) return null

  const selectedAccounts = selectedIds
    .map((id) => accounts.find((a) => a.id === id))
    .filter((a): a is LocalAccountSummary => Boolean(a))

  // Find best metrics
  let highestWr = -1
  let mostGames = -1

  for (const acc of selectedAccounts) {
    const stats = getOpggCachedStats(acc.riot_id || acc.name, acc.region, activeGame)
    if (stats) {
      if (stats.winRate > highestWr) highestWr = stats.winRate
      const total = stats.wins + stats.losses
      if (total > mostGames) mostGames = total
    }
  }

  const handleSlotChange = (slotIndex: number, newId: string) => {
    playHextechSelect()
    const next = [...selectedIds]
    next[slotIndex] = newId
    setSelectedIds(next)
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-panel compare-modal-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Account Comparison Matrix"
      >
        <div className="modal-head">
          <div className="compare-modal-title">
            <Sparkles size={18} className="text-amethyst-400" />
            <h2>Multi-Account Comparison Matrix</h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close comparison modal"
          >
            <X size={16} />
          </button>
        </div>

        <p className="compare-modal-desc">
          Compare rank progress, win rates, and champion pools side-by-side across your active {activeGame === 'valorant' ? 'VALORANT' : 'League'} accounts.
        </p>

        {selectedAccounts.length === 0 ? (
          <div className="compare-empty">Add at least two accounts to compare performance.</div>
        ) : (
          <div className="compare-matrix-grid" style={{ gridTemplateColumns: `repeat(${selectedAccounts.length}, 1fr)` }}>
            {selectedAccounts.map((acc, index) => {
              const rank = activeGame === 'valorant' ? acc.valorant_rank || 'Unranked' : acc.rank || 'Unranked'
              const stats = getOpggCachedStats(acc.riot_id || acc.name, acc.region, activeGame)
              const totalGames = stats ? stats.wins + stats.losses : 0
              const isBestWr = stats && stats.winRate === highestWr && highestWr > 0
              const isMostActive = totalGames === mostGames && mostGames > 5

              return (
                <div key={acc.id} className={`compare-card ${getRankTierClass(rank)}`}>
                  {/* Account Selector Dropdown */}
                  <div className="compare-slot-select">
                    <select
                      className="hextech-input compare-select"
                      value={acc.id}
                      onChange={(e) => handleSlotChange(index, e.target.value)}
                    >
                      {gameAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.region})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Header Crest & Rank */}
                  <div className="compare-crest-zone">
                    <div className="compare-crest">
                      <RankCrest rank={rank} game={activeGame} />
                    </div>
                    <strong className="compare-rank-name">{rank}</strong>
                    <span className="compare-account-name">{acc.name}</span>
                    <span className="compare-account-region">{acc.region}</span>
                  </div>

                  {/* Metrics Badges */}
                  <div className="compare-metrics-zone">
                    {stats ? (
                      <>
                        <div className={`compare-metric-row ${isBestWr ? 'highlight-best' : ''}`}>
                          <span className="compare-metric-label">Win Rate</span>
                          <span className="compare-metric-value">
                            {stats.winRate}% {isBestWr ? <span className="best-tag">Best</span> : null}
                          </span>
                        </div>

                        <div className={`compare-metric-row ${isMostActive ? 'highlight-best' : ''}`}>
                          <span className="compare-metric-label">Total Games</span>
                          <span className="compare-metric-value">
                            {totalGames} ({stats.wins}W · {stats.losses}L)
                          </span>
                        </div>

                        {stats.combatStats?.kd !== undefined ? (
                          <div className="compare-metric-row">
                            <span className="compare-metric-label">K/D Ratio</span>
                            <span className="compare-metric-value">{stats.combatStats.kd.toFixed(2)}</span>
                          </div>
                        ) : null}

                        {stats.combatStats?.headshotRate !== undefined ? (
                          <div className="compare-metric-row">
                            <span className="compare-metric-label">HS%</span>
                            <span className="compare-metric-value">{stats.combatStats.headshotRate}%</span>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="compare-no-stats">No season statistics synced yet</div>
                    )}
                  </div>

                  {/* Top Champions */}
                  <div className="compare-champions-zone">
                    <span className="compare-section-label">Most Played</span>
                    {stats?.topChampions && stats.topChampions.length > 0 ? (
                      <CardTopChampions heroes={stats.topChampions} />
                    ) : (
                      <span className="compare-muted">None recorded</span>
                    )}
                  </div>

                  {/* Quick Launch CTA */}
                  <button
                    type="button"
                    className="btn-modal-primary compare-launch-btn"
                    onClick={() => {
                      playHextechLaunch()
                      onClose()
                      onLaunchAccount(acc.id, activeGame)
                    }}
                  >
                    <Play size={13} fill="currentColor" /> Launch {acc.name}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
