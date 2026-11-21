import type { FormEvent } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ExternalLink,
  Flame,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react'
import type { OpggStats } from '../../../lib/opgg.ts'
import type { Game } from '../../../lib/types.ts'
import { SeasonRecord } from '../SeasonRecord.tsx'
import { TopHeroesStrip } from './TopHeroesStrip.tsx'
import { InspectorIconButton } from './InspectorIconButton.tsx'
import { SeasonStatsSkeleton, ContentReveal } from '../skeleton/index.ts'
import {
  calculateLpDelta,
  getRankHistory,
  getSeasonPeakRank,
  getStreakPips,
} from '../../../lib/rankHistory.ts'

export function InspectorSeasonStats({
  stats,
  statsLoading,
  statsError,
  isVal,
  riotTag,
  rank,
  opggRank,
  showOpggRank,
  level,
  onRefresh,
  onOpenOpgg,
  canOpenOpgg,
  isEditingRiotId,
  riotIdInput,
  savingRiotId,
  riotIdError,
  onStartRiotIdEdit,
  onCancelRiotIdEdit,
  onChangeRiotIdInput,
  onSubmitRiotId,
  hasValidInputTag,
  accountId,
  game = 'league',
}: {
  stats: OpggStats | null
  statsLoading: boolean
  statsError: string | null
  isVal: boolean
  riotTag: string | null
  rank: string
  opggRank?: string
  showOpggRank: boolean
  level?: number
  onRefresh: () => void
  onOpenOpgg: () => void
  canOpenOpgg: boolean
  isEditingRiotId: boolean
  riotIdInput: string
  savingRiotId: boolean
  riotIdError: string | null
  onStartRiotIdEdit: () => void
  onCancelRiotIdEdit: () => void
  onChangeRiotIdInput: (val: string) => void
  onSubmitRiotId: (e: FormEvent) => void
  hasValidInputTag: boolean
  accountId?: string
  game?: Game
}) {
  const isRefreshing = statsLoading && Boolean(stats)
  const isInitialLoading = statsLoading && !stats

  const lp = isVal ? stats?.rr ?? 0 : stats?.leaguePoints ?? 0
  const lpDelta = accountId ? calculateLpDelta(accountId, game, lp) : null
  const peakRank = accountId ? getSeasonPeakRank(accountId, game) : null
  const streakPips = stats ? getStreakPips(stats.wins, stats.losses, stats.winRate) : []
  const history = accountId ? getRankHistory(accountId, game) : []

  return (
    <section className="inspector-section" aria-label="Season stats">
      <div className="inspector-section-heading">
        <h3>
          <Trophy size={14} aria-hidden="true" /> Season stats
        </h3>
        <div className="inspector-icon-group">
          <InspectorIconButton
            label="Refresh season stats"
            title="Refresh season stats from OP.GG"
            onClick={onRefresh}
            disabled={statsLoading || !riotTag}
          >
            <RefreshCw size={14} className={statsLoading ? 'animate-spin' : ''} />
          </InspectorIconButton>
          <InspectorIconButton
            label="View on OP.GG"
            title="Open full stats on OP.GG"
            onClick={onOpenOpgg}
            disabled={!canOpenOpgg}
          >
            <ExternalLink size={14} />
          </InspectorIconButton>
        </div>
      </div>

      <div className="inspector-stats-card">
        {isRefreshing ? (
          <div
            className="inspector-refresh-accent-line"
            role="progressbar"
            aria-label="Refreshing season stats"
            aria-busy="true"
          />
        ) : null}

        {isInitialLoading ? (
          <SeasonStatsSkeleton isVal={isVal} />
        ) : stats ? (
          <ContentReveal active={!statsLoading}>
            {/* Momentum & Highlights Row */}
            <div className="inspector-stats-highlights">
              {/* LP Delta Badge */}
              {lpDelta !== null && lpDelta !== 0 ? (
                <div
                  className={`inspector-lp-delta-badge ${lpDelta > 0 ? 'positive' : 'negative'}`}
                  title={`Recent LP change: ${lpDelta > 0 ? `+${lpDelta}` : lpDelta} LP`}
                >
                  {lpDelta > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  <span>{lpDelta > 0 ? `+${lpDelta}` : lpDelta} LP</span>
                </div>
              ) : null}

              {/* Hot Streak Badge */}
              {stats.winRate && stats.winRate >= 54 && stats.wins >= 15 ? (
                <div
                  className="inspector-momentum-badge"
                  title={`${stats.winRate}% win rate across ${stats.wins + stats.losses} ranked games`}
                >
                  <Flame size={11} aria-hidden="true" />
                  <span>Hot Streak · {stats.winRate}% WR</span>
                </div>
              ) : null}

              {/* Peak Rank Badge */}
              {peakRank && peakRank !== stats.formattedRank ? (
                <div className="inspector-peak-badge" title={`Highest recorded rank: ${peakRank}`}>
                  <span>Peak: {peakRank}</span>
                </div>
              ) : null}
            </div>

            {/* Recent 5-Game Form Strip */}
            {streakPips.length > 0 ? (
              <div className="inspector-form-strip" title="Recent 5-game form">
                <span className="inspector-form-label">Recent Form:</span>
                <div className="inspector-form-pips">
                  {streakPips.map((isWin, i) => (
                    <span
                      key={i}
                      className={`inspector-form-pip ${isWin ? 'win' : 'loss'}`}
                      title={isWin ? 'Win' : 'Loss'}
                    >
                      {isWin ? 'W' : 'L'}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {isVal ? (
              <div className="inspector-valorant-stats">
                {stats.topChampions && stats.topChampions.length > 0 ? (
                  <TopHeroesStrip heroes={stats.topChampions} game="valorant" />
                ) : null}
                <dl className="inspector-season-metrics">
                  {showOpggRank ? (
                    <div>
                      <dt>OP.GG rank</dt>
                      <dd>{opggRank}</dd>
                    </div>
                  ) : null}
                  {typeof level === 'number' ? (
                    <div>
                      <dt>Account level</dt>
                      <dd>{level}</dd>
                    </div>
                  ) : !showOpggRank ? (
                    <div>
                      <dt>Competitive rank</dt>
                      <dd>{rank}</dd>
                    </div>
                  ) : null}
                  {stats.combatStats?.kd !== undefined ? (
                    <div title="Kill / Death ratio this season">
                      <dt>K/D</dt>
                      <dd>{stats.combatStats.kd.toFixed(2)}</dd>
                    </div>
                  ) : null}
                  {stats.combatStats?.headshotRate !== undefined ? (
                    <div title="Headshot hit rate this season">
                      <dt>HS%</dt>
                      <dd>{stats.combatStats.headshotRate}%</dd>
                    </div>
                  ) : null}
                  {stats.wins + stats.losses === 0 && !stats.combatStats ? (
                    <div title="No competitive matches recorded in the current active Act on OP.GG">
                      <dt>Current Act</dt>
                      <dd>0 matches</dd>
                    </div>
                  ) : null}
                </dl>
                {stats.wins + stats.losses > 0 ? (
                  <SeasonRecord
                    wins={stats.wins}
                    losses={stats.losses}
                    fallback={<p className="inspector-stat-message">{stats.formattedWinRate}</p>}
                  />
                ) : null}
              </div>
            ) : (
              <div className="inspector-league-stats">
                {stats.topChampions && stats.topChampions.length > 0 ? (
                  <TopHeroesStrip heroes={stats.topChampions} game="league" />
                ) : null}
                <SeasonRecord
                  wins={stats.wins}
                  losses={stats.losses}
                  fallback={
                    <p className="inspector-stat-message">
                      {stats.formattedWinRate || 'No ranked games'}
                    </p>
                  }
                />
              </div>
            )}

            {/* Historical Climb Sparkline (if history points > 2) */}
            {history.length >= 2 ? (
              <div className="inspector-climb-tracker" aria-label="LP Climb Progression">
                <div className="inspector-climb-header">
                  <span>
                    <TrendingUp size={11} /> LP Progression
                  </span>
                  <small>{history.length} snapshots recorded</small>
                </div>
                <div className="inspector-sparkline-wrapper">
                  <svg className="inspector-sparkline-svg" viewBox="0 0 100 24" preserveAspectRatio="none">
                    {(() => {
                      const lps = history.map((h) => h.lp)
                      const min = Math.min(...lps)
                      const max = Math.max(...lps)
                      const range = max - min || 1
                      const points = history
                        .map((h, i) => {
                          const x = (i / (history.length - 1)) * 100
                          const y = 22 - ((h.lp - min) / range) * 18
                          return `${x.toFixed(1)},${y.toFixed(1)}`
                        })
                        .join(' ')
                      return (
                        <>
                          <polyline
                            fill="none"
                            stroke="rgba(168, 85, 247, 0.75)"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={points}
                          />
                        </>
                      )
                    })()}
                  </svg>
                </div>
              </div>
            ) : null}
          </ContentReveal>
        ) : riotTag && !isEditingRiotId ? (
          <p className="inspector-stat-message" role="status">
            {statsError?.toLowerCase().includes('not found')
              ? 'Not found on OP.GG'
              : 'Season stats unavailable'}
          </p>
        ) : null}

        {isEditingRiotId ? (
          <form className="inspector-riot-id-form" onSubmit={onSubmitRiotId}>
            <div className="inspector-riot-id-input">
              <input
                type="text"
                className="hextech-input"
                aria-label="Riot ID"
                placeholder="Name#Tag"
                value={riotIdInput}
                onChange={(event) => onChangeRiotIdInput(event.target.value)}
                autoFocus
                disabled={savingRiotId}
              />
              <InspectorIconButton
                label="Save Riot ID"
                type="submit"
                disabled={savingRiotId || !riotIdInput.trim() || !hasValidInputTag}
              >
                {savingRiotId ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
              </InspectorIconButton>
              <InspectorIconButton
                label="Cancel"
                onClick={onCancelRiotIdEdit}
                disabled={savingRiotId}
              >
                <X size={14} />
              </InspectorIconButton>
            </div>
            {riotIdError ? <p className="inspector-error-msg">{riotIdError}</p> : null}
          </form>
        ) : (
          <div className="inspector-riot-id-display">
            <span className="inspector-riot-id-value">{riotTag || 'No Riot ID linked'}</span>
            <InspectorIconButton
              label={riotTag ? 'Change linked Riot ID' : 'Link Riot ID'}
              title={riotTag ? 'Change linked Riot ID' : 'Link Riot ID'}
              onClick={onStartRiotIdEdit}
            >
              {riotTag ? <Pencil size={12} /> : <Link2 size={12} />}
            </InspectorIconButton>
          </div>
        )}
      </div>
    </section>
  )
}
