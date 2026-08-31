import { useEffect, useState } from 'react'
import { LaptopMinimal, ShieldCheck } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { GlassCard } from '../components/GlassCard'

type Device = { id: string; userId: string; deviceName: string; platform: string; appVersion: string; status: string; lastSeenAt: string; user: string; publicKeyPresent: boolean }
type DevicesPageProps = { offline: boolean; onToast: (message: string) => void }

export function DevicesPage({ offline, onToast }: DevicesPageProps) {
  const [devices, setDevices] = useState<Device[]>([])
  const refresh = async () => { if (offline) return; try { setDevices((await api.getDevices()).devices) } catch (error) { onToast(error instanceof ApiError ? error.message : 'Unable to load devices') } }
  useEffect(() => { void refresh() }, [offline])
  return <div className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10"><p className="eyebrow">Trust / Devices</p><h1 className="display-title mt-3">Every device, cryptographically known.</h1><p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">Review bound keys, app versions, and last-seen signals before a launch.</p><GlassCard className="mt-7 overflow-hidden"><div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-5 sm:px-6"><span className="section-icon section-icon-green"><LaptopMinimal aria-hidden="true" size={16} /></span><div><h2 className="section-title">Bound devices <span className="font-mono text-[11px] text-slate-600">{devices.length}</span></h2><p className="mt-1 text-xs text-slate-500">Ed25519 public keys registered to operators</p></div></div><div className="divide-y divide-white/[0.05]">{devices.map((device) => <div key={device.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6"><div className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-300/15 bg-emerald-300/10 text-emerald-200"><LaptopMinimal aria-hidden="true" size={18} /></div><div className="min-w-[180px] flex-1"><p className="text-xs font-medium text-slate-200">{device.deviceName}</p><p className="mt-1 text-[11px] text-slate-500">{device.user} · {device.platform === 'macos' ? 'macOS' : 'Windows'} · v{device.appVersion}</p></div><span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300"><ShieldCheck aria-hidden="true" size={13} />{device.publicKeyPresent ? 'Key present' : 'Needs rebind'}</span><span className="font-mono text-[10px] text-slate-600">Last seen {new Date(device.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>)}{!devices.length ? <p className="px-6 py-10 text-center text-xs text-slate-500">Device data becomes available after the API connects.</p> : null}</div></GlassCard></div>
}
