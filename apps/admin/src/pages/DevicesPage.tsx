import { useEffect, useState } from 'react'
import { LaptopMinimal, ShieldCheck, Trash2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { GlassCard } from '../components/GlassCard'
import { StatusBadge } from '../components/StatusBadge'

type Device = { id: string; userId: string; deviceName: string; platform: string; appVersion: string; status: string; lastSeenAt: string; user: string; publicKeyPresent: boolean }
type DevicesPageProps = { offline: boolean; onToast: (message: string) => void }

export function DevicesPage({ offline, onToast }: DevicesPageProps) {
  const [devices, setDevices] = useState<Device[]>([])
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const refresh = async () => {
    if (offline) return
    try {
      setDevices((await api.getDevices()).devices)
    } catch (error) {
      onToast(error instanceof ApiError ? error.message : 'Unable to load computers')
    }
  }

  useEffect(() => {
    void refresh()
  }, [offline])

  const handleRevoke = async (deviceId: string, deviceName: string) => {
    setRevokingId(deviceId)
    try {
      await api.revokeDevice(deviceId)
      onToast(`Computer "${deviceName}" revoked`)
      await refresh()
    } catch (error) {
      onToast(error instanceof ApiError ? error.message : 'Unable to revoke computer')
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
      <p className="eyebrow">Computers</p>
      <h1 className="display-title mt-3">Your connected computers.</h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">Only approved computers can start an account session.</p>
      <GlassCard className="mt-7 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-5 sm:px-6">
          <span className="section-icon section-icon-green">
            <LaptopMinimal aria-hidden="true" size={16} />
          </span>
          <div>
            <h2 className="section-title">Connected computers <span className="font-mono text-[11px] text-slate-600">{devices.length}</span></h2>
            <p className="mt-1 text-xs text-slate-500">A computer appears here after someone opens LAAP Desktop.</p>
          </div>
        </div>
        <div className="divide-y divide-white/[0.05]">
          {devices.map((device) => {
            const ready = device.status === 'active' && device.publicKeyPresent
            const isRevoking = revokingId === device.id

            return (
              <div key={device.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
                <div className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-300/15 bg-emerald-300/10 text-emerald-200">
                  <LaptopMinimal aria-hidden="true" size={18} />
                </div>
                <div className="min-w-[180px] flex-1">
                  <p className="text-xs font-medium text-slate-200">{device.deviceName}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {device.user} · {device.platform === 'macos' ? 'macOS' : device.platform === 'windows' ? 'Windows' : device.platform} · LAAP {device.appVersion}
                  </p>
                </div>
                <StatusBadge value={ready ? 'Ready' : 'Needs attention'} compact />
                <span className="font-mono text-[10px] text-slate-600">
                  Last connected {new Date(device.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {ready ? <ShieldCheck aria-hidden="true" className="text-emerald-300" size={15} /> : null}
                <button
                  type="button"
                  className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-xs text-slate-400 transition hover:border-rose-400/20 hover:bg-rose-400/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/80 disabled:opacity-50"
                  onClick={() => void handleRevoke(device.id, device.deviceName)}
                  disabled={offline || isRevoking}
                  title="Revoke and unlink this computer"
                >
                  <Trash2 size={13} />
                  <span>{isRevoking ? 'Revoking…' : 'Revoke'}</span>
                </button>
              </div>
            )
          })}
          {!devices.length ? <p className="px-6 py-10 text-center text-xs text-slate-500">No computers are connected yet.</p> : null}
        </div>
      </GlassCard>
    </div>
  )
}
