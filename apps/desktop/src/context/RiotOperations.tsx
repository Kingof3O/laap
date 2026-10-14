import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { invokeTauri, isTauriAvailable } from '../lib/api'
import { useDialog } from '../shared/hooks/useDialog'

export interface RuntimeSnapshot {
  riot_client: boolean
  league_client: boolean
  league_game: boolean
  valorant_game: boolean
}
interface Operations {
  busy: boolean
  running: boolean
  provisioning: boolean
  launchStatus: string | null
  tracking: boolean
  activeLaunchKey: string | null
  run: <T>(
    action: (confirmed: boolean) => Promise<T>,
    options?: { launchKey: string; allowRelaunch?: boolean },
  ) => Promise<T>
}
const Context = createContext<Operations | null>(null)
export function RiotOperationsProvider({ children }: { children: ReactNode }) {
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)
  const [provisioning, setProvisioning] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [launchStatus, setLaunchStatus] = useState<string | null>(null)
  const [tracking, setTracking] = useState(false)
  const [activeLaunchKey, setActiveLaunchKey] = useState<string | null>(null)
  const activeKey = useRef<string | null>(null)
  const stopTracking = useRef(false)
  const resolve = useRef<((yes: boolean) => void) | null>(null)
  const locked = useRef(false)
  const mounted = useRef(true)
  const answer = (yes: boolean) => {
    setConfirm(false)
    resolve.current?.(yes)
    resolve.current = null
  }
  const ref = useDialog(confirm, () => answer(false))
  const snapshot = async () => {
    const state = await invokeTauri<RuntimeSnapshot>('runtime_snapshot')
    if (mounted.current) {
      const anyRunning = Object.values(state).some(Boolean)
      setRunning(anyRunning)
      if (!anyRunning && !locked.current) {
        activeKey.current = null
        setActiveLaunchKey(null)
      }
    }
    return state
  }
  useEffect(() => {
    const provision = (event: Event) =>
      setProvisioning((event as CustomEvent<boolean>).detail)
    window.addEventListener('laap:provisioning', provision)
    mounted.current = true
    let pending = false
    const refresh = async () => {
      if (!isTauriAvailable() || pending || locked.current) return
      pending = true
      try {
        await snapshot()
      } catch {
        /* Status is advisory; actions surface native errors. */
      } finally {
        pending = false
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 3000)
    return () => {
      window.removeEventListener('laap:provisioning', provision)
      mounted.current = false
      stopTracking.current = true
      window.clearInterval(timer)
      resolve.current?.(false)
      resolve.current = null
    }
  }, [])
  const run = async <T,>(
    action: (confirmed: boolean) => Promise<T>,
    options?: { launchKey: string; allowRelaunch?: boolean },
  ) => {
    if (locked.current)
      throw new Error('Another Riot operation is in progress.')
    locked.current = true
    setBusy(true)
    stopTracking.current = false
    if (options) setLaunchStatus('Preparing account and starting Riot Client…')
    window.dispatchEvent(new CustomEvent('laap:operation', { detail: true }))
    const ask = () =>
      new Promise<boolean>((done) => {
        resolve.current = done
        setConfirm(true)
      })
    try {
      const state = await snapshot()
      if (
        options &&
        !options.allowRelaunch &&
        activeKey.current === options.launchKey &&
        Object.values(state).some(Boolean)
      ) {
        throw new Error(
          'This profile already has a running client. Use Stop Riot before relaunching it.',
        )
      }
      let confirmed = false
      if (state.league_game || state.valorant_game) {
        confirmed = await ask()
        if (!confirmed)
          throw new Error('Operation cancelled. Your game is still running.')
      }
      let result: T
      try {
        result = await action(confirmed)
      } catch (error) {
        if (
          !confirmed &&
          String(error).includes('ACTIVE_MATCH_CONFIRMATION_REQUIRED')
        ) {
          if (!(await ask()))
            throw new Error('Operation cancelled. Your game is still running.')
          result = await action(true)
        } else throw error
      }
      if (options && mounted.current) {
        activeKey.current = options.launchKey
        setActiveLaunchKey(options.launchKey)
        setTracking(true)
        const deadline = Date.now() + 120000
        let detected = false
        try {
          while (mounted.current && !stopTracking.current) {
            const state = await snapshot()
            if (state.league_client || state.league_game) {
              detected = true
              setLaunchStatus('League Client detected. Continue in the client.')
              break
            }
            setLaunchStatus(
              state.riot_client
                ? 'Riot Client detected · waiting for League Client…'
                : 'Waiting for Riot Client to start…',
            )
            if (Date.now() >= deadline) {
              setLaunchStatus(
                state.riot_client
                  ? 'Riot Client is running, but League has not appeared. Check Riot for sign-in, updates or errors.'
                  : 'No Riot Client detected after 2 minutes. Check the client installation and try again.',
              )
              break
            }
            await new Promise((done) => window.setTimeout(done, 1000))
          }
          if (stopTracking.current && mounted.current && !detected)
            setLaunchStatus(
              'Stopped waiting. Check Riot Client before trying again; the client was not stopped.',
            )
        } catch (cause) {
          if (mounted.current)
            setLaunchStatus(
              `Unable to track client startup: ${String(cause)}. Check Riot Client before retrying.`,
            )
        } finally {
          if (mounted.current) setTracking(false)
        }
      }
      return result
    } catch (cause) {
      if (options && mounted.current)
        setLaunchStatus(`Launch could not finish: ${String(cause)}`)
      throw cause
    } finally {
      locked.current = false
      if (mounted.current) {
        setBusy(false)
        void snapshot().catch(() => {})
      }
      window.dispatchEvent(new CustomEvent('laap:operation', { detail: false }))
    }
  }
  return (
    <Context.Provider
      value={{
        busy,
        running,
        provisioning,
        run,
        launchStatus,
        tracking,
        activeLaunchKey: running || tracking ? activeLaunchKey : null,
      }}
    >
      {children}
      {launchStatus ? (
        <div
          className="client-launch-status"
          role="status"
          aria-live="polite"
          aria-busy={tracking}
        >
          <span>
            {tracking ? (
              <span className="status-spinner animate-spin" aria-hidden="true">
                ◌
              </span>
            ) : null}{' '}
            {launchStatus}
          </span>
          {tracking ? (
            <button
              type="button"
              className="btn-modal-secondary"
              onClick={() => {
                stopTracking.current = true
              }}
            >
              Stop waiting
            </button>
          ) : (
            <button
              type="button"
              className="btn-modal-secondary"
              onClick={() => setLaunchStatus(null)}
            >
              Dismiss
            </button>
          )}
        </div>
      ) : null}
      {confirm ? (
        <div className="modal-backdrop">
          <div
            className="modal-panel"
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby="match-warning"
            tabIndex={-1}
          >
            <div className="modal-head">
              <h2 id="match-warning">Leave your live game?</h2>
            </div>
            <div className="modal-body">
              <p>
                A match is currently in progress. Stopping Riot will leave your
                live game. Are you sure you want to exit?
              </p>
            </div>
            <div className="modal-foot">
              <button
                className="btn-modal-secondary"
                onClick={() => answer(false)}
              >
                Keep playing
              </button>
              <button className="btn-modal-danger" onClick={() => answer(true)}>
                Exit game and continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Context.Provider>
  )
}
export function useRiotOperations() {
  const value = useContext(Context)
  if (!value) throw new Error('Riot operation provider unavailable')
  return value
}
