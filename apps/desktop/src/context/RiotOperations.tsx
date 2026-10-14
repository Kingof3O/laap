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
  run: <T>(action: (confirmed: boolean) => Promise<T>) => Promise<T>
}
const Context = createContext<Operations | null>(null)
export function RiotOperationsProvider({ children }: { children: ReactNode }) {
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)
  const [provisioning, setProvisioning] = useState(false)
  const [confirm, setConfirm] = useState(false)
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
    if (mounted.current) setRunning(Object.values(state).some(Boolean))
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
      window.clearInterval(timer)
      resolve.current?.(false)
      resolve.current = null
    }
  }, [])
  const run = async <T,>(action: (confirmed: boolean) => Promise<T>) => {
    if (locked.current)
      throw new Error('Another Riot operation is in progress.')
    locked.current = true
    setBusy(true)
    window.dispatchEvent(new CustomEvent('laap:operation', { detail: true }))
    const ask = () =>
      new Promise<boolean>((done) => {
        resolve.current = done
        setConfirm(true)
      })
    try {
      const state = await snapshot()
      let confirmed = false
      if (state.league_game || state.valorant_game) {
        confirmed = await ask()
        if (!confirmed)
          throw new Error('Operation cancelled. Your game is still running.')
      }
      try {
        return await action(confirmed)
      } catch (error) {
        if (
          !confirmed &&
          String(error).includes('ACTIVE_MATCH_CONFIRMATION_REQUIRED')
        ) {
          if (!(await ask()))
            throw new Error('Operation cancelled. Your game is still running.')
          return await action(true)
        }
        throw error
      }
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
    <Context.Provider value={{ busy, running, provisioning, run }}>
      {children}
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
