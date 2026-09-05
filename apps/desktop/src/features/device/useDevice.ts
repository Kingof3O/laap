import { useEffect, useState } from 'react'
import { apiRequest, hasTauri, invokeTauri } from '../../lib/api'
import type { User } from '../../lib/types'

export interface DeviceState {
  deviceId: string | null
  loading: boolean
  error: string | null
}

export function useDevice(user: User | null): DeviceState {
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user || !hasTauri) {
      setDeviceId(null)
      setLoading(false)
      setError(null)
      return
    }

    let isMounted = true
    let heartbeatTimer: number | undefined
    setLoading(true)

    void (async () => {
      try {
        const key = await invokeTauri<string>('device_public_key')
        const info = await invokeTauri<{ platform: string; device_name: string; app_version: string }>('device_info')
        if (info.platform !== 'windows' && info.platform !== 'macos') {
          throw new Error('LAAP Desktop only supports Windows and macOS devices.')
        }

        const result = await apiRequest<{ deviceId: string }>('/api/devices', {
          method: 'POST',
          body: JSON.stringify({
            publicKey: key,
            platform: info.platform,
            deviceName: info.device_name,
            appVersion: info.app_version,
          }),
        })

        if (isMounted) {
          setDeviceId(result.deviceId)
          setError(null)
        }
        if (!isMounted) return
        heartbeatTimer = window.setInterval(() => {
          void apiRequest(`/api/devices/${result.deviceId}/heartbeat`, {
            method: 'POST',
            body: JSON.stringify({ appVersion: info.app_version }),
          }).catch((cause) => {
            if (isMounted && cause instanceof Error && /not authorized|revoked/i.test(cause.message)) setError(cause.message)
          })
        }, 60_000)
      } catch (cause) {
        if (isMounted) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    })()

    return () => {
      isMounted = false
      if (heartbeatTimer !== undefined) window.clearInterval(heartbeatTimer)
    }
  }, [user])

  return { deviceId, loading, error }
}
