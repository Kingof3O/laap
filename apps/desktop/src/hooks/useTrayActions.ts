import { useEffect, useRef } from 'react'
import { invokeTauri, isTauriAvailable } from '../lib/api'
import { useRiotOperations } from '../context/RiotOperations'
import type { LauncherController } from './useLauncher'
import type { LocalAccountSummary } from '../lib/types'
type TrayIntent =
  | { type: 'open' | 'stop_riot' | 'retry_setup' | 'quit' }
  | { type: 'select_presence'; mode: 'online' | 'offline' }
  | { type: 'switch_account'; id: string }
export function useTrayActions(
  launcher: LauncherController,
  onAccount: (id: string) => void,
  onError: (message: string) => void,
) {
  const operations = useRiotOperations()
  const current = useRef({ launcher, operations, onAccount, onError })
  current.current = { launcher, operations, onAccount, onError }
  const pending = useRef(false)
  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    let last = ''
    let refreshing = false
    const refresh = async () => {
      if (disposed || refreshing || !isTauriAvailable()) return
      refreshing = true
      try {
        const { launcher, operations } = current.current
        const accounts = await invokeTauri<LocalAccountSummary[]>(
          'list_local_accounts',
        )
        if (!Array.isArray(accounts)) return
        const restored = await invokeTauri<string | null>(
          'active_local_profile',
        ).catch(() => null)
        const snapshot = {
          accounts: accounts.map((a) => ({
            id: a.id,
            name: a.name,
            region: a.region,
            has_session: a.has_session,
          })),
          active_id: operations.activeLaunchKey?.startsWith('local:')
            ? operations.activeLaunchKey.slice(6)
            : operations.running
              ? restored
              : null,
          presence:
            launcher.error ??
            launcher.presence?.message ??
            'Preparing presence…',
          mode: launcher.presence?.desired_mode ?? 'online',
          busy:
            operations.busy ||
            operations.provisioning ||
            launcher.busy ||
            pending.current,
          running: operations.running,
          setup_failed: launcher.presence?.state === 'setup_failed',
        }
        const serialized = JSON.stringify(snapshot)
        if (serialized !== last) {
          await invokeTauri('update_tray', { snapshot })
          last = serialized
        }
      } catch {
        const { launcher, operations } = current.current
        const snapshot = {
          accounts: [],
          active_id: null,
          presence: 'Vault unavailable. Open LAAP to retry.',
          mode: launcher.presence?.desired_mode ?? 'online',
          busy: operations.busy || operations.provisioning || launcher.busy || pending.current,
          running: operations.running,
          setup_failed: launcher.presence?.state === 'setup_failed',
        }
        await invokeTauri('update_tray', { snapshot }).catch(() => {})
        last = '' 
      } finally {
        refreshing = false
      }
    }
    const handle = async (event: Event) => {
      const intent = (event as CustomEvent<TrayIntent>).detail
      if (!intent) return
      const { launcher, operations, onAccount, onError } = current.current
      if (intent.type === 'switch_account') {
        onAccount(intent.id)
        return
      }
      if (intent.type === 'open') {
        void invokeTauri('show_launcher').catch(() => {})
        return
      }
      if (pending.current || operations.busy) return
      pending.current = true
      try {
        if (intent.type === 'select_presence')
          await launcher.changeMode(intent.mode)
        if (intent.type === 'retry_setup') await launcher.retry()
        if (intent.type === 'stop_riot')
          await operations.run((confirmed) =>
            invokeTauri('close_riot_client', { confirmed }),
          )
        if (intent.type === 'quit') {
          await operations.run(async (confirmed) => {
            await invokeTauri('prepare_quit', { confirmed })
            const jobs: Promise<unknown>[] = []
            window.dispatchEvent(
              new CustomEvent('laap:before-quit', { detail: jobs }),
            )
            await Promise.all(jobs)
          })
          await invokeTauri('finish_quit')
        }
      } catch (cause) {
        void invokeTauri('show_launcher').catch(() => {})
        onError(String(cause))
      } finally {
        pending.current = false
        void refresh()
      }
    }
    const handler = (event: Event) => {
      void handle(event)
    }
    window.addEventListener('laap:tray-intent', handler)
    if (isTauriAvailable())
      void import('@tauri-apps/api/event')
        .then(async ({ listen }) => {
          const stop = await listen<TrayIntent>('laap:tray-intent', (event) =>
            window.dispatchEvent(
              new CustomEvent('laap:tray-intent', { detail: event.payload }),
            ),
          )
          if (disposed) {
            stop()
            return
          }
          unlisten = stop
          await invokeTauri('tray_client_ready')
          void refresh()
        })
        .catch(() => {
          /* Browser fixtures have no native event channel. */
        })
    void refresh()
    const timer = window.setInterval(() => void refresh(), 2000)
    return () => {
      disposed = true
      window.clearInterval(timer)
      window.removeEventListener('laap:tray-intent', handler)
      unlisten?.()
    }
  }, [])
}
