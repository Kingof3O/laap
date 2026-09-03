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
      return
    }

    let isMounted = true
    setLoading(true)

    void (async () => {
      try {
        const key = await invokeTauri<string>('device_public_key')
        const platform = await invokeTauri<string>('device_platform').catch(() =>
          /win/i.test(navigator.userAgent) ? 'windows' : 'macos'
        )

        const result = await apiRequest<{ deviceId: string }>('/api/devices', {
          method: 'POST',
          body: JSON.stringify({
            publicKey: key,
            platform: platform === 'windows' ? 'windows' : 'macos',
            deviceName: 'Gaming Launcher',
            appVersion: '1.0.0',
          }),
        })

        if (isMounted) {
          setDeviceId(result.deviceId)
          setError(null)
        }
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
    }
  }, [user])

  return { deviceId, loading, error }
}
