import { useId, useRef } from 'react'
import { Star, RefreshCw, Crosshair, Swords } from 'lucide-react'
import type { Game, ProfileDetails } from '../../lib/types'
import { emptyCustomization } from '../../lib/profileCustomization'
import { useGame } from '../../context/GameContext'
import { RegionSelect } from './RegionSelect'
import { RankCrest, RankPicker } from './RankPicker'
import { ValorantRankPicker } from './ValorantRankPicker'
import { ProfileAvatar } from './ProfileAvatar'
import { IconPicker } from './IconPicker'

export function ProfilePreview({
  details,
  activeGame: propActiveGame,
}: {
  details: ProfileDetails
  activeGame?: Game
}) {
  let contextGame: Game = 'league'
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    contextGame = useGame().activeGame
  } catch {
    // outside provider fallback
  }
  const activeGame = propActiveGame ?? contextGame
  const isVal = activeGame === 'valorant'
  const supportedGames =
    details.games && details.games.length > 0 ? details.games : [activeGame]
  const displayRank = isVal
    ? (details.valorant_rank ?? details.rank)
    : (details.rank ?? details.valorant_rank)

  return (
    <div className="profile-preview">
      <div className="profile-preview-avatar">
        <ProfileAvatar
          name={details.name}
          asset={details.customization?.icon_asset}
          activeGame={isVal ? 'valorant' : 'league'}
        />
        {details.favorite ? (
          <Star className="preview-favorite" size={14} fill="currentColor" />
        ) : null}
      </div>
      <div className="profile-preview-identity">
        <span className="profile-eyebrow">PROFILE PREVIEW</span>
        <h3>{details.name.trim() || 'Your account'}</h3>
        <div className="profile-preview-badges">
          <span className="profile-region-chip">
            {details.region || 'Choose region'}
          </span>
          {supportedGames.includes('league') && (
            <span
              className="game-badge game-badge-league"
              title="League of Legends"
            >
              <img src="/league-of-legends-icon.webp" alt="" className="game-badge-icon" aria-hidden="true" />
              LEAGUE
            </span>
          )}
          {supportedGames.includes('valorant') && (
            <span
              className="game-badge game-badge-valo"
              title="VALORANT"
            >
              <img src="/valorant-icon.webp" alt="" className="game-badge-icon" aria-hidden="true" />
              VALO
            </span>
          )}
          {displayRank ? (
            <span className="profile-preview-rank">
              {isVal ? (
                <img src="/valorant-icon.webp" alt="" className="game-badge-icon" aria-hidden="true" />
              ) : (
                <RankCrest rank={displayRank} />
              )}{' '}
              {displayRank}
            </span>
          ) : (
            <span className="profile-muted">No rank set</span>
          )}
        </div>
      </div>
    </div>
  )
}

export function ProfileFields({
  details,
  onChange,
  disabled = false,
  nameLabel = 'Name',
  regionLabel = 'Region',
  rankLabel = 'Rank',
  onAssetBusy,
  isLaunched = false,
  activeGame: propActiveGame,
}: {
  details: ProfileDetails
  onChange: (details: ProfileDetails) => void
  disabled?: boolean
  nameLabel?: string
  regionLabel?: string
  rankLabel?: string
  onAssetBusy: (busy: boolean) => void
  isLaunched?: boolean
  activeGame?: Game
}) {
  const id = useId()
  let contextGame: Game = 'league'
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    contextGame = useGame().activeGame
  } catch {
    // outside provider fallback
  }
  const activeGame = propActiveGame ?? contextGame
  const games =
    details.games && details.games.length > 0 ? details.games : [activeGame]

  const customization = { ...emptyCustomization(), ...details.customization }

  // Preserve previously entered ranks in refs
  const preservedLeagueRank = useRef<string | null>(details.rank ?? null)
  const preservedValRank = useRef<string | null>(details.valorant_rank ?? null)

  if (details.rank) preservedLeagueRank.current = details.rank
  if (details.valorant_rank) preservedValRank.current = details.valorant_rank

  const handleGameToggle = (game: Game, checked: boolean) => {
    if (disabled) return
    if (!checked) {
      if (games.length <= 1 && games.includes(game)) return
      if (isLaunched && games.includes(game)) return
      const nextGames = games.filter((g) => g !== game)
      onChange({
        ...details,
        games: nextGames,
      })
    } else {
      if (!games.includes(game)) {
        const nextGames = [...games, game]
        onChange({
          ...details,
          games: nextGames,
          rank:
            game === 'league' && !details.rank
              ? preservedLeagueRank.current
              : details.rank,
          valorant_rank:
            game === 'valorant' && !details.valorant_rank
              ? preservedValRank.current
              : details.valorant_rank,
        })
      }
    }
  }

  const isGameDisabled = (game: Game) => {
    if (disabled) return true
    if (games.includes(game) && games.length === 1) return true
    if (isLaunched && games.includes(game)) return true
    return false
  }

  return (
    <div className="profile-fields-columns">
      <div className="profile-col-primary">
        <div className="profile-form-grid">
          {/* Games Section */}
          <div className="field-block profile-field-wide profile-games-field">
            <div className="profile-games-header">
              <span className="field-label">Games</span>
              <span className="field-caption">
                The same Riot login works for both games.
              </span>
            </div>
            <div
              className="profile-game-chips"
              role="group"
              aria-label="Supported games"
            >
              <label
                className={`profile-game-chip ${
                  games.includes('league') ? 'profile-game-chip-selected' : ''
                } ${isGameDisabled('league') ? 'profile-game-chip-disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  aria-label="League of Legends"
                  checked={games.includes('league')}
                  disabled={isGameDisabled('league')}
                  onChange={(e) =>
                    handleGameToggle('league', e.target.checked)
                  }
                />
                <img
                  src="/league-of-legends-icon.webp"
                  alt=""
                  className="profile-game-chip-icon"
                  aria-hidden="true"
                />
                <span>League of Legends</span>
              </label>
              <label
                className={`profile-game-chip ${
                  games.includes('valorant') ? 'profile-game-chip-selected' : ''
                } ${isGameDisabled('valorant') ? 'profile-game-chip-disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  aria-label="VALORANT"
                  checked={games.includes('valorant')}
                  disabled={isGameDisabled('valorant')}
                  onChange={(e) =>
                    handleGameToggle('valorant', e.target.checked)
                  }
                />
                <img
                  src="/valorant-icon.webp"
                  alt=""
                  className="profile-game-chip-icon"
                  aria-hidden="true"
                />
                <span>VALORANT</span>
              </label>
            </div>
            {isLaunched ? (
              <p className="field-caption profile-field-warning">
                Stop the running client before changing this profile's games.
              </p>
            ) : games.length === 1 ? (
              <p className="field-caption">
                At least one game must remain selected.
              </p>
            ) : null}
          </div>

          <label className="field-block profile-field-wide">
            <span className="field-label">{nameLabel}</span>
            <input
              className="hextech-input"
              required
              maxLength={120}
              disabled={disabled}
              value={details.name}
              onChange={(e) => onChange({ ...details, name: e.target.value })}
              placeholder="e.g. My main account"
            />
          </label>
          <label className="field-block profile-field-wide">
            <span className="field-label">
              Riot ID{' '}
              <span className="profile-muted">
                Optional (e.g. Name#TAG for OP.GG stats)
              </span>
            </span>
            <input
              className="hextech-input"
              maxLength={120}
              disabled={disabled}
              value={details.riot_id ?? ''}
              onChange={(e) =>
                onChange({ ...details, riot_id: e.target.value })
              }
              placeholder="e.g. Kingof3O#EUW"
            />
          </label>
          <div className="field-block">
            <span className="field-label">{regionLabel}</span>
            <RegionSelect
              label={regionLabel}
              value={details.region}
              disabled={disabled}
              onChange={(region) => onChange({ ...details, region })}
            />
          </div>

          {/* Per-Game Rank Pickers */}
          {games.includes('league') && (
            <div className="field-block">
              <span className="field-label">
                {games.includes('valorant') ? 'League rank (optional)' : rankLabel}
              </span>
              <RankPicker
                label={games.includes('valorant') ? 'League rank (optional)' : rankLabel}
                value={details.rank}
                disabled={disabled || customization.auto_sync_rank}
                onChange={(rank) => {
                  preservedLeagueRank.current = rank
                  onChange({ ...details, rank })
                }}
              />
            </div>
          )}
          {games.includes('valorant') && (
            <div className="field-block">
              <span className="field-label">VALORANT rank (optional)</span>
              <ValorantRankPicker
                label="VALORANT rank (optional)"
                value={details.valorant_rank}
                disabled={disabled || customization.auto_sync_valorant_rank}
                onChange={(rank) => {
                  preservedValRank.current = rank
                  onChange({ ...details, valorant_rank: rank })
                }}
              />
              <label
                className="profile-sync-toggle"
                style={{ marginTop: '8px' }}
              >
                <input
                  type="checkbox"
                  disabled={disabled}
                  aria-label="Auto-sync VALORANT rank from OP.GG"
                  checked={Boolean(customization.auto_sync_valorant_rank)}
                  onChange={(e) =>
                    onChange({
                      ...details,
                      customization: {
                        ...customization,
                        auto_sync_valorant_rank: e.target.checked,
                      },
                    })
                  }
                />
                <span>
                  Auto-sync VALORANT rank
                  <small>Sync competitive tier from OP.GG</small>
                </span>
              </label>
            </div>
          )}

          <label className="field-block profile-field-wide">
            <span className="field-label">
              Notes <span className="profile-muted">Optional</span>
            </span>
            <textarea
              className="hextech-input profile-notes-input"
              aria-label="Notes"
              aria-describedby={`${id}-notes-help`}
              rows={3}
              maxLength={2000}
              disabled={disabled}
              value={details.notes}
              onChange={(e) => onChange({ ...details, notes: e.target.value })}
              placeholder="Account details, goals, or a reminder…"
            />
            <span className="field-caption" id={`${id}-notes-help`}>
              {details.notes.length}/2000 · Only stored in your local vault
            </span>
          </label>
        </div>
        <label className="profile-favorite-toggle">
          <input
            type="checkbox"
            disabled={disabled}
            aria-label="Favorite profile"
            checked={details.favorite}
            onChange={(e) =>
              onChange({ ...details, favorite: e.target.checked })
            }
          />
          <Star size={15} />
          <span>
            Favorite profile
            <small>Mark this account with a star in your roster.</small>
          </span>
        </label>
      </div>

      {/* League-only Customization & Client Sync Panel */}
      {activeGame === 'valorant' ? (
        games.includes('league') ? (
          <section
            className="profile-advanced-panel"
            aria-labelledby={`${id}-customization-heading`}
          >
            <div className="profile-panel-header">
              <h3
                id={`${id}-customization-heading`}
                className="profile-col-heading"
              >
                Customization
              </h3>
            </div>
            <div className="profile-tools-grid">
              <p className="profile-information profile-callout">
                Customization is League-only
              </p>
            </div>
          </section>
        ) : null
      ) : (
        games.includes('league') && (
          <section
            className="profile-advanced-panel"
            aria-labelledby={`${id}-customization-heading`}
          >
            <div className="profile-panel-header">
              <h3
                id={`${id}-customization-heading`}
                className="profile-col-heading"
              >
                Customization &amp; Client Sync
              </h3>
              <span className="profile-panel-badge">Always visible</span>
            </div>
            <div className="profile-tools-grid">
              <IconPicker
                value={customization}
                disabled={disabled}
                onBusy={onAssetBusy}
                onChange={(customization) =>
                  onChange({ ...details, customization })
                }
              />
              <section className="profile-sync-settings">
                <div className="profile-section-heading">
                  <div>
                    <h3>Sync from League Client</h3>
                    <p>
                      Optional · Read-only · Your account identity is checked
                      before updates.
                    </p>
                  </div>
                  <RefreshCw size={17} />
                </div>
                <label className="profile-sync-toggle">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    aria-label="Auto-sync icon on game login"
                    checked={customization.auto_sync_icon}
                    onChange={(e) =>
                      onChange({
                        ...details,
                        customization: {
                          ...customization,
                          auto_sync_icon: e.target.checked,
                        },
                      })
                    }
                  />
                  <span>
                    Auto-sync icon on game login
                    <small>
                      Use your equipped summoner icon. Missing images download
                      from Riot and are cached locally.
                    </small>
                  </span>
                </label>
                <label className="profile-sync-toggle">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    aria-label="Auto-sync rank on game login"
                    checked={customization.auto_sync_rank}
                    onChange={(e) =>
                      onChange({
                        ...details,
                        customization: {
                          ...customization,
                          auto_sync_rank: e.target.checked,
                        },
                      })
                    }
                  />
                  <span>
                    Auto-sync rank on game login
                    <small>
                      Use your current Solo/Duo rank. Turn this off to choose a
                      rank manually.
                    </small>
                  </span>
                </label>
                <p className="field-caption">
                  Sync starts after you save, while LAAP and League Client are
                  open. If the client is unavailable, your saved icon and rank
                  stay unchanged.
                </p>
              </section>
            </div>
          </section>
        )
      )}
    </div>
  )
}
