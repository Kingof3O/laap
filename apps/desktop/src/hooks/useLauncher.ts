import { useCallback, useEffect, useRef, useState } from 'react'
import { invokeTauri, isTauriAvailable } from '../lib/api'
import { useRiotOperations } from '../context/RiotOperations'
export type PresenceMode = 'online' | 'offline'
export interface LauncherView {
  windows: boolean
  settings: {
    riot_client_path: string | null
    presence_enabled: boolean
    presence_mode: PresenceMode
  }
  detected_client: { path: string; source: string } | null
  detection_error: string | null
  presence_ready: boolean
  presence_supported: boolean
}
export interface PresenceStatus {
  enabled: boolean
  desired_mode: PresenceMode
  applied_mode: PresenceMode | null
  state:
    | 'preparing'
    | 'setup_failed'
    | 'normal_online'
    | 'disabled'
    | 'next_launch'
    | 'restart_required'
    | 'waiting'
    | 'active'
    | 'error'
  message: string
}
export function useLauncher() {
  const operations = useRiotOperations()
  const [view, setView] = useState<LauncherView | null>(null)
  const [presence, setPresence] = useState<PresenceStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)
  const pending = useRef(false)
  const enabled = useRef(false)
  enabled.current = Boolean(view?.settings.presence_enabled)
  const refresh = useCallback(async () => {
    if (!isTauriAvailable()) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const next = await invokeTauri<LauncherView | null>(
        'get_launcher_settings',
      )
      if (mounted.current && next) {
        setView(next)
        setError(null)
      }
    } catch (cause) {
      if (mounted.current) setError(String(cause))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    mounted.current = true
    void refresh()
    let attempt = 0
    let retryTimer: number | undefined
    let initializing = false
    const initialize = async (first = true) => {
      if (!isTauriAvailable() || initializing || pending.current) return
      initializing = true
      pending.current = true
      setBusy(true)
      if (first)
        setPresence({
          enabled: true,
          desired_mode: 'online',
          applied_mode: null,
          state: 'preparing',
          message: 'Preparing LAAP Presence…',
        })
      try {
        const state = await invokeTauri<PresenceStatus | null>(
          first ? 'initialize_presence' : 'retry_presence',
        )
        if (!mounted.current || !state) return
        setPresence(state)
        await refresh()
        if (state.state === 'setup_failed' && attempt < 3)
          retryTimer = window.setTimeout(
            () => void initialize(false),
            [2000, 5000, 15000][attempt++],
          )
      } catch (cause) {
        if (mounted.current) setError(String(cause))
      } finally {
        initializing = false
        pending.current = false
        if (mounted.current) setBusy(false)
      }
    }
    void initialize()
    const lateBridge = window.setTimeout(() => {
      if (isTauriAvailable() && !enabled.current) void initialize()
    }, 1200)
    const reload = () => void refresh()
    window.addEventListener('laap:refresh', reload)
    return () => {
      mounted.current = false
      window.clearTimeout(lateBridge)
      if (retryTimer) window.clearTimeout(retryTimer)
      window.removeEventListener('laap:refresh', reload)
    }
  }, [refresh])
  const updatePresence = useCallback(async () => {
    if (pending.current || !isTauriAvailable() || !enabled.current) return
    pending.current = true
    try {
      let status = await invokeTauri<PresenceStatus | null>(
        'get_presence_status',
      )
      if (status?.state === 'waiting') {
        if (mounted.current) setBusy(true)
        status = await invokeTauri<PresenceStatus>('retry_presence')
      }
      if (mounted.current && status) {
        setPresence(status)
        setError(null)
      }
    } catch (cause) {
      if (mounted.current) setError(String(cause))
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }, [])
  useEffect(() => {
    if (!view?.settings.presence_enabled) {
      setPresence(null)
      return
    }
    void updatePresence()
    const timer = window.setInterval(() => void updatePresence(), 5000)
    const operationFinished = (event: Event) => {
      if (!(event as CustomEvent<boolean>).detail) void updatePresence()
    }
    window.addEventListener('laap:operation', operationFinished)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('laap:operation', operationFinished)
    }
  }, [view?.settings.presence_enabled, updatePresence])
  const command = async <T>(name: string, args?: Record<string, unknown>) => {
    if (pending.current)
      throw new Error('Please wait for the current presence request.')
    pending.current = true
    setBusy(true)
    setError(null)
    try {
      return await invokeTauri<T>(name, args)
    } catch (cause) {
      if (mounted.current) setError(String(cause))
      throw cause
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const save = async (path: string, presenceEnabled: boolean) => {
    const next = await command<LauncherView>('save_launcher_settings', {
      riotClientPath: path.trim() || null,
      presenceEnabled,
    })
    if (mounted.current) setView(next)
    enabled.current = next.settings.presence_enabled
    await updatePresence()
  }
  const prepare = async () => {
    const next = await command<LauncherView>('prepare_presence_support')
    if (mounted.current) setView(next)
  }
  const changeMode = async (mode: PresenceMode) => {
    const next = await command<PresenceStatus>('set_presence_mode', { mode })
    if (mounted.current) setPresence(next)
  }
  const retry = async () => {
    const next = await command<PresenceStatus>('retry_presence')
    if (mounted.current) setPresence(next)
  }
  const allowOnline = async () => {
    const next = await command<PresenceStatus>('allow_normal_online_launch')
    if (mounted.current) setPresence(next)
  }
  const restart = async () => {
    setError(null)
    try {
      await operations.run(
        (confirmed) => invokeTauri('restart_riot_presence', { confirmed }),
        {
          launchKey: operations.activeLaunchKey ?? 'presence:restart',
          allowRelaunch: true,
        },
      )
      await updatePresence()
    } catch (cause) {
      if (mounted.current) setError(String(cause))
    }
  }
  return {
    view,
    presence,
    error,
    busy,
    loading,
    refresh,
    save,
    prepare,
    changeMode,
    retry,
    restart,
    allowOnline,
  }
}
export type LauncherController = ReturnType<typeof useLauncher>
