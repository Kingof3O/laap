import type { FormEvent } from 'react'
import { Check, ExternalLink, Flame, Link2, Loader2, Pencil, RefreshCw, Trophy, X } from 'lucide-react'
import type { OpggStats } from '../../../lib/opgg.ts'
import { SeasonRecord } from '../SeasonRecord.tsx'
import { TopHeroesStrip } from './TopHeroesStrip.tsx'
import { InspectorIconButton } from './InspectorIconButton.tsx'

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
}) {
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
        {statsLoading ? (
          <p className="inspector-stat-message" role="status">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            Fetching {isVal ? 'VALORANT' : 'League'} stats…
          </p>
        ) : stats ? (
          isVal ? (
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
              {stats.winRate && stats.winRate >= 54 && stats.wins >= 15 ? (
                <div
                  className="inspector-momentum-badge"
                  title={`${stats.winRate}% win rate across ${stats.wins + stats.losses} ranked games`}
                >
                  <Flame size={11} aria-hidden="true" />
                  <span>Hot Streak · {stats.winRate}% WR</span>
                </div>
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
          )
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
                label="Cancel Riot ID edit"
                onClick={onCancelRiotIdEdit}
                disabled={savingRiotId}
              >
                <X size={14} />
              </InspectorIconButton>
            </div>
            {riotIdError ? (
              <p className="inspector-stat-error" role="alert">
                {riotIdError}
              </p>
            ) : null}
          </form>
        ) : (
          <div className="inspector-riot-id">
            <span title={riotTag ?? undefined}>{riotTag ?? 'No Riot ID linked'}</span>
            <InspectorIconButton
              label={riotTag ? 'Change linked Riot ID' : 'Link Riot ID'}
              onClick={onStartRiotIdEdit}
            >
              {riotTag ? <Pencil size={14} /> : <Link2 size={15} />}
            </InspectorIconButton>
          </div>
        )}
      </div>
    </section>
  )
}
