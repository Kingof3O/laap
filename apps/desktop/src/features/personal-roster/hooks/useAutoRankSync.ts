import { useEffect, useRef } from 'react'
import type { Game, LocalAccountSummary } from '../../../lib/types.ts'
import { autoSyncAccountRank, getOpggSummonerUrl } from '../../../lib/opgg.ts'

export function useAutoRankSync(localAccounts: LocalAccountSummary[], activeGame: Game) {
  const autoSyncedAccountsRef = useRef(new Map<string, string>())

  useEffect(() => {
    for (const acc of localAccounts) {
      if ((acc.games ?? ['league']).includes(activeGame)) {
        const targetRiotId = acc.riot_id || acc.name
        const info = getOpggSummonerUrl(acc.name, acc.region, targetRiotId, activeGame)
        const syncKey = `${acc.id}:${activeGame}`
        const syncTarget = JSON.stringify([
          info.url,
          acc.region,
          acc.customization?.auto_sync_valorant_rank,
        ])
        if (!info.hasTag) {
          autoSyncedAccountsRef.current.delete(syncKey)
        } else if (autoSyncedAccountsRef.current.get(syncKey) !== syncTarget) {
          autoSyncedAccountsRef.current.set(syncKey, syncTarget)
          void autoSyncAccountRank(
            {
              id: acc.id,
              name: acc.name,
              region: acc.region,
              rank: acc.rank,
              valorant_rank: acc.valorant_rank,
              riotId: targetRiotId,
            },
            activeGame,
          )
        }
      }
    }
  }, [localAccounts, activeGame])
}
