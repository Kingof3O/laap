import { useEffect, useState } from 'react'
import type { Game, LiveMatchStatus, LiveStatusBadge, LiveStatusSettings, LocalAccountSummary } from '../../../lib/types.ts'
import type { LiveMatchWarningTarget } from '../../../shared/ui/LiveMatchWarningModal.tsx'
import { formatLiveMinutes } from '../../../lib/liveStatus.ts'
import { invokeTauri } from '../../../lib/api.ts'
import { useToast } from '../../../context/ToastContext.tsx'
import { useRiotOperations } from '../../../context/RiotOperations.tsx'

export function useAccountLaunch({
  localAccounts,
  activeGame,
  liveSettings,
  busy,
  setBusy,
  provisioning,
  trayRequest,
  loading,
  onTrayRequestHandled,
  setRefreshTarget,
  launchAccount,
  applyLiveStatusResult,
}: {
  localAccounts: LocalAccountSummary[]
  activeGame: Game
  liveSettings: LiveStatusSettings | null
  busy: boolean
  setBusy: (busy: boolean) => void
  provisioning: boolean
  trayRequest?: { id: string; sequence: number } | null
  loading: boolean
  onTrayRequestHandled?: () => void
  setRefreshTarget: (acc: LocalAccountSummary | null) => void
  launchAccount: (id: string, game?: Game) => Promise<unknown>
  applyLiveStatusResult: (account: LocalAccountSummary, res: LiveMatchStatus) => void
}) {
  const { showError } = useToast()
  const operations = useRiotOperations()

  const [launchScope, activeProfileId, launchGame = 'league'] =
    operations.activeLaunchKey?.split(':') ?? []
  const activeLaunchId =
    launchScope === 'local' && launchGame === activeGame ? activeProfileId : null

  const [launchingId, setLaunchingId] = useState<string | null>(null)
  const [failedLaunchId, setFailedLaunchId] = useState<string | null>(null)
  const [liveWarning, setLiveWarning] = useState<LiveMatchWarningTarget | null>(null)

  const handleLaunch = async (
    id: string,
    game: Game = activeGame,
    skipLiveCheck = false,
  ) => {
    const account = localAccounts.find((a) => a.id === id)
    setBusy(true)
    setLaunchingId(id)
    setFailedLaunchId(null)
    try {
      if (
        !skipLiveCheck &&
        game === 'league' &&
        account &&
        liveSettings?.mode &&
        liveSettings.mode !== 'off' &&
        liveSettings.prelaunchGuard &&
        (account.has_puuid || account.name.includes('#'))
      ) {
        try {
          const res = await invokeTauri<LiveMatchStatus>('check_account_live_status', {
            accountId: account.id,
            region: account.region,
            name: account.name,
            bypassCache: false,
          })
          if (res.configured) {
            applyLiveStatusResult(account, res)
            if (res.inGame) {
              setLiveWarning({
                accountId: account.id,
                name: account.name,
                gameMode: res.gameMode,
                elapsedMinutes: formatLiveMinutes(res.gameLengthSeconds),
              })
              return
            }
          }
        } catch (cause) {
          showError(
            `Live match check skipped: ${cause instanceof Error ? cause.message : String(cause)}`,
          )
        }
      }
      await launchAccount(id, game)
    } catch (cause) {
      setFailedLaunchId(id)
      showError(String(cause))
    } finally {
      setBusy(false)
      setLaunchingId(null)
    }
  }

  useEffect(() => {
    if (!trayRequest || loading) return
    onTrayRequestHandled?.()
    const account = localAccounts.find((a) => a.id === trayRequest.id)
    if (!account) {
      showError('That profile no longer exists. Refresh the roster.')
      return
    }
    if (!(account.games ?? ['league']).includes(activeGame)) {
      showError('That profile is unavailable for the selected game.')
      return
    }
    if (busy || operations.busy || provisioning) {
      showError('Please wait for the current Riot operation.')
      return
    }
    if (!account.has_session) {
      void invokeTauri('show_launcher').catch(() => {})
      setRefreshTarget(account)
      return
    }
    void handleLaunch(account.id, activeGame)
  }, [trayRequest, loading, activeGame])

  return {
    launchingId,
    failedLaunchId,
    activeLaunchId,
    liveWarning,
    setLiveWarning,
    handleLaunch,
  }
}
