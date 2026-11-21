import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { ChampionStat } from '../../lib/opgg.ts'
import { openExternalUrl } from '../../lib/api.ts'
import { playHextechSelect } from '../../lib/soundEffects.ts'

export function CardChampionPortrait({ hero }: { hero: ChampionStat }) {
  const [hovered, setHovered] = useState(false)
  const [imgError, setImgError] = useState(false)

  const record = hero.count
    ? `${hero.count} games`
    : hero.wins !== undefined && hero.losses !== undefined && hero.wins + hero.losses > 0
      ? `${hero.wins}W · ${hero.losses}L`
      : ''
  const wr = hero.winRate !== undefined && hero.winRate > 0 ? `${hero.winRate}% WR` : ''
  const tooltipTitle = `${hero.name}${wr ? ` · ${wr}` : ''}${record ? ` (${record})` : ''}`
  const initial = hero.name ? hero.name.slice(0, 2).toUpperCase() : '?'

  const handleOpenBuild = (e: React.MouseEvent) => {
    e.stopPropagation()
    playHextechSelect()
    const cleanName = hero.name.toLowerCase().replace(/[^a-z0-9]/g, '')
    const url = `https://www.op.gg/champions/${cleanName}/build`
    void openExternalUrl(url)
  }

  return (
    <div
      className="card-champion-item"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onClick={handleOpenBuild}
      tabIndex={0}
      title={tooltipTitle}
      aria-label={tooltipTitle}
      role="button"
      style={{ cursor: 'pointer' }}
    >
      <img
        src={hero.iconUrl}
        alt={hero.name}
        className="card-champion-img"
        loading="lazy"
        onError={() => setImgError(true)}
        style={imgError ? { display: 'none' } : undefined}
      />
      {imgError ? (
        <span className="card-champion-fallback" aria-hidden="true">
          {initial}
        </span>
      ) : null}
      {hovered ? (
        <div className="card-champion-tooltip" role="tooltip">
          <div className="card-champion-tooltip-name">
            <span>{hero.name}</span>
            <ExternalLink size={10} className="card-champion-tooltip-link-icon" aria-hidden="true" />
          </div>
          <div className="card-champion-tooltip-meta">
            {record ? <span className="card-champion-tooltip-games">{record}</span> : null}
            {hero.winRate !== undefined && hero.winRate > 0 ? (
              <span
                className={`card-champion-tooltip-wr ${
                  hero.winRate >= 55
                    ? 'card-champion-wr-high'
                    : hero.winRate <= 45
                      ? 'card-champion-wr-low'
                      : ''
                }`}
              >
                {hero.winRate}% WR
              </span>
            ) : null}
            {hero.kda !== undefined ? (
              <span className="card-champion-tooltip-kda">{hero.kda} KDA</span>
            ) : null}
          </div>
          <span className="card-champion-tooltip-cta">Click for runes &amp; build</span>
        </div>
      ) : null}
    </div>
  )
}

export function CardTopChampions({
  heroes,
  className = '',
}: {
  heroes?: ChampionStat[] | null
  className?: string
}) {
  if (!heroes || heroes.length === 0) return null
  const top3 = heroes.slice(0, 3)

  return (
    <div
      className={`card-top-champions ${className}`}
      aria-label="Top 3 most played champions"
    >
      <span className="card-top-champions-label">Most Played</span>
      <div className="card-top-champions-list">
        {top3.map((hero) => (
          <CardChampionPortrait key={hero.name} hero={hero} />
        ))}
      </div>
    </div>
  )
}
