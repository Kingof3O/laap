import { useEffect, useState } from 'react'
import type { LiveMatchStatus, LiveStatusBadge, LiveStatusSettings, LocalAccountSummary } from '../../../lib/types.ts'
import { formatLiveMode } from '../../../lib/liveStatus.ts'
import { hasTauri, invokeTauri } from '../../../lib/api.ts'
import { useToast } from '../../../context/ToastContext.tsx'

export function useRosterLiveStatus(
  localAccounts: LocalAccountSummary[],
  loadAccounts: () => Promise<unknown>,
) {
  const { showSuccess, showError } = useToast()
  const [liveSettings, setLiveSettings] = useState<LiveStatusSettings | null>(null)
  const [liveStatusById, setLiveStatusById] = useState<Record<string, LiveStatusBadge>>({})

  useEffect(() => {
    if (!hasTauri) return
    let active = true
    invokeTauri<LiveStatusSettings | null>('get_live_status_settings')
      .then((res) => {
        if (active && res) setLiveSettings(res)
      })
      .catch(() => {})
    const onConfigUpdate = (event: Event) => {
      const detail = (event as CustomEvent<LiveStatusSettings>).detail
      if (detail) setLiveSettings(detail)
    }
    window.addEventListener('laap:live-status-config', onConfigUpdate)
    return () => {
      active = false
      window.removeEventListener('laap:live-status-config', onConfigUpdate)
    }
  }, [])

  const applyLiveStatusResult = (account: LocalAccountSummary, res: LiveMatchStatus) => {
    setLiveStatusById((prev) => ({
      ...prev,
      [account.id]: {
        checking: false,
        inGame: res.inGame,
        gameMode: res.gameMode,
        gameLengthSeconds: res.gameLengthSeconds,
        checkedAt: res.checkedAt,
      },
    }))
    if (!account.has_puuid && res.puuid) {
      void loadAccounts()
    }
  }

  const handleCheckLive = async (id: string) => {
    const account = localAccounts.find((a) => a.id === id)
    if (!account) return
    setLiveStatusById((prev) => ({
      ...prev,
      [id]: { ...prev[id], checking: true },
    }))
    try {
      const res = await invokeTauri<LiveMatchStatus>('check_account_live_status', {
        accountId: account.id,
        region: account.region,
        name: account.name,
        bypassCache: true,
      })
      if (!res.configured) {
        setLiveStatusById((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        showError(
          'Live match tracking is Off — enable Personal Key or Cloudflare Worker in Settings → Advanced first.',
        )
        return
      }
      applyLiveStatusResult(account, res)
      showSuccess(
        res.inGame
          ? `${account.name} is currently in a match (${formatLiveMode(res.gameMode)}).`
          : `${account.name} is not in a game.`,
      )
    } catch (cause) {
      setLiveStatusById((prev) => {
        const current = prev[id]
        if (!current) return prev
        const next = { ...prev }
        if (typeof current.inGame === 'boolean') {
          next[id] = { ...current, checking: false }
        } else {
          delete next[id]
        }
        return next
      })
      showError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return {
    liveSettings,
    liveStatusById,
    applyLiveStatusResult,
    handleCheckLive,
  }
}
