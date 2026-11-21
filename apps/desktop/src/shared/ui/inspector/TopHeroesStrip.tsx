import type { ChampionStat } from '../../../lib/opgg.ts'
import type { Game } from '../../../lib/types.ts'

export function TopHeroesStrip({
  heroes,
  game = 'league',
}: {
  heroes: ChampionStat[]
  game?: Game
}) {
  if (!heroes || heroes.length === 0) return null
  const top3 = heroes.slice(0, 3)
  const isVal = game === 'valorant'

  return (
    <div
      className="inspector-top-heroes-section"
      aria-label={isVal ? 'Top agents' : 'Most played champions'}
    >
      <span className="inspector-top-heroes-label">
        {isVal ? 'Top Agents' : 'Most Played'}
      </span>
      <div className="inspector-top-heroes">
        {top3.map((hero) => {
          const record = hero.count
            ? `${hero.count} games`
            : hero.wins !== undefined && hero.losses !== undefined && hero.wins + hero.losses > 0
              ? `${hero.wins}W - ${hero.losses}L`
              : ''
          const wr = hero.winRate !== undefined && hero.winRate > 0 ? `${hero.winRate}% WR` : ''
          const tooltip =
            record || wr
              ? `${hero.name}${wr ? ` · ${wr}` : ''}${record ? ` (${record})` : ''}`
              : `${hero.name} · Most played agent`

          return (
            <div
              key={hero.name}
              className="inspector-hero-pill"
              title={tooltip}
              aria-label={tooltip}
            >
              <img
                src={hero.iconUrl}
                alt={hero.name}
                className="inspector-hero-icon"
                loading="lazy"
              />
              {hero.winRate !== undefined && hero.winRate > 0 ? (
                <span
                  className={`inspector-hero-wr ${
                    hero.winRate >= 55
                      ? 'inspector-hero-wr-high'
                      : hero.winRate <= 45
                        ? 'inspector-hero-wr-low'
                        : ''
                  }`}
                >
                  {hero.winRate}%
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
