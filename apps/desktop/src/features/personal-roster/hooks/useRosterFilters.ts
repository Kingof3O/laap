import { useEffect, useMemo, useState } from 'react'
import type { Game, LocalAccountSummary, Region } from '../../../lib/types.ts'
import { getOpggCachedRank } from '../../../lib/opgg.ts'
import { sortProfiles, type SortOrder } from '../../../lib/sorting.ts'

export function useRosterFilters({
  localAccounts,
  activeGame,
  searchQuery,
  selectedRegion,
  selectedRank,
  sortOrder,
  favoritesOnly,
  onRankOptionsChange,
  onFavoriteCountChange,
  onCountChange,
}: {
  localAccounts: LocalAccountSummary[]
  activeGame: Game
  searchQuery: string
  selectedRegion: Region
  selectedRank: string
  sortOrder: SortOrder
  favoritesOnly?: boolean
  onRankOptionsChange: (ranks: string[]) => void
  onFavoriteCountChange?: (count: number) => void
  onCountChange?: (count: number) => void
}) {
  const [opggRevision, setOpggRevision] = useState(0)

  useEffect(() => {
    const update = () => setOpggRevision((rev) => rev + 1)
    window.addEventListener('laap:opgg-updated', update)
    return () => window.removeEventListener('laap:opgg-updated', update)
  }, [])

  const gameAccounts = useMemo(
    () =>
      localAccounts
        .filter((account) => (account.games ?? ['league']).includes(activeGame))
        .map((account) => {
          const rawRank = activeGame === 'valorant' ? account.valorant_rank : account.rank
          const riotId = account.riot_id || account.name
          const effectiveRank =
            rawRank?.trim() && rawRank.trim().toLowerCase() !== 'unranked'
              ? rawRank
              : getOpggCachedRank(riotId, account.region, activeGame) ?? rawRank
          return {
            ...account,
            effectiveRank,
            rank: activeGame === 'league' ? effectiveRank : account.rank,
            valorant_rank: activeGame === 'valorant' ? effectiveRank : account.valorant_rank,
          }
        }),
    [localAccounts, activeGame, opggRevision],
  )

  const rankOptions = useMemo(
    () =>
      [
        ...new Map(
          gameAccounts.flatMap((a) => {
            const r = a.effectiveRank
            return r?.trim() ? [[r.trim().toLowerCase(), r.trim()] as const] : []
          }),
        ).values(),
      ].sort((a, b) => a.localeCompare(b)),
    [gameAccounts],
  )

  useEffect(() => {
    onRankOptionsChange(rankOptions)
  }, [rankOptions, onRankOptionsChange])

  useEffect(() => {
    const favCount = gameAccounts.filter((a) => a.favorite).length
    onFavoriteCountChange?.(favCount)
  }, [gameAccounts, onFavoriteCountChange])

  const filteredAccounts = useMemo(
    () =>
      sortProfiles(
        gameAccounts.filter((acc) => {
          if (favoritesOnly && !acc.favorite) return false
          const rank = acc.effectiveRank?.trim().toLowerCase() ?? ''
          return (
            (selectedRegion === 'ALL' || acc.region.toUpperCase() === selectedRegion) &&
            (selectedRank === 'all' ||
              (selectedRank === 'unlabeled' ? !rank : selectedRank === `rank:${rank}`)) &&
            `${acc.name} ${acc.region} ${rank} ${acc.notes ?? ''}`
              .toLowerCase()
              .includes(searchQuery.trim().toLowerCase())
          )
        }),
        sortOrder,
        { activeGame },
      ),
    [gameAccounts, activeGame, selectedRegion, selectedRank, searchQuery, sortOrder, favoritesOnly],
  )

  useEffect(() => {
    onCountChange?.(filteredAccounts.length)
  }, [filteredAccounts.length, onCountChange])

  return {
    gameAccounts,
    rankOptions,
    filteredAccounts,
  }
}
