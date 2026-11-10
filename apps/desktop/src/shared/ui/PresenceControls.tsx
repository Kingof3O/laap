import { useEffect, useRef, useState } from 'react'
import type { LauncherController, PresenceMode } from '../../hooks/useLauncher'
import { Check, ChevronDown, Radio, RefreshCw } from 'lucide-react'

export function PresenceSelect({ launcher, operationBusy = false }: { launcher: LauncherController; operationBusy?: boolean }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', key) }
  }, [open])
  if (!launcher.view) return null
  if (!launcher.view.presence_supported || !launcher.view.settings.presence_enabled) return <span className="presence-unavailable" role="status">{launcher.busy ? 'Preparing presence…' : 'Presence unavailable'}</span>
  const status = launcher.presence
  const desired = status?.desired_mode ?? launcher.view.settings.presence_mode
  const active = status?.state === 'active' && status.applied_mode === desired
  const label = status?.state === 'restart_required' ? 'Restart required' : desired === 'offline' ? (active ? 'Offline active' : 'Offline requested') : (active ? 'Online' : 'Online requested')
  const choose = (mode: PresenceMode) => { void launcher.changeMode(mode).catch(() => {}); setOpen(false); trigger.current?.focus() }
  return <div className="presence-control" ref={root}>
    <button ref={trigger} type="button" className="presence-trigger" aria-label={`Online presence: ${label}`} aria-expanded={open} aria-controls="presence-menu" onClick={() => setOpen(!open)}><Radio size={15}/><span>{label}</span><i className={active ? 'presence-dot active' : 'presence-dot pending'} aria-hidden="true"/><ChevronDown size={14}/></button>
    {open ? <div className="presence-popover" id="presence-menu" role="group" aria-label="Presence options">
      <div className="presence-menu-title">Presence</div>
      <p className="presence-current">Requested: {desired === 'offline' ? 'Appear offline' : 'Online'} · Applied: {status?.applied_mode ? (status.applied_mode === 'offline' ? 'Offline' : 'Online') : 'Not confirmed'}</p>
      {status?.state !== 'restart_required' || launcher.error ? <p role="status">{launcher.error ?? (launcher.busy ? 'Applying presence…' : status?.message ?? 'Checking presence…')}</p> : null}
      <button type="button" disabled={launcher.busy} onClick={() => choose('online')}>Online {desired === 'online' ? <Check size={15}/> : null}</button>
      <button type="button" disabled={launcher.busy} onClick={() => choose('offline')}>Appear offline {desired === 'offline' ? <Check size={15}/> : null}</button>
      {status?.state === 'restart_required' ? <div className="presence-restart"><p>Restart Riot to apply your selected presence mode.</p><button type="button" className="presence-restart-action" disabled={launcher.busy || operationBusy} onClick={() => void launcher.restart()}>Apply presence · Restart Riot</button></div> : null}
      {status?.state === 'setup_failed' && desired === 'online' ? <button type="button" disabled={launcher.busy} onClick={() => void launcher.allowOnline().catch(() => {})}>Allow normal Online launch</button> : null}
      {status?.state === 'error' || status?.state === 'setup_failed' || status?.state === 'normal_online' || launcher.error ? <button type="button" disabled={launcher.busy} onClick={() => void launcher.retry().catch(() => {})}><RefreshCw size={14}/> Retry presence</button> : null}
    </div> : null}
  </div>
}
export function PresenceBanner({ launcher, operationBusy }: { launcher: LauncherController; operationBusy: boolean }) {
  const status = launcher.presence
  if (!launcher.view?.presence_supported || !launcher.view.settings.presence_enabled || (!launcher.error && !['setup_failed', 'error'].includes(status?.state ?? ''))) return null
  return <div className={`presence-status presence-status-${status?.state ?? 'error'}`} role="status"><span>{launcher.error ?? status?.message}</span>{status?.state === 'restart_required' ? <button type="button" className="btn-modal-secondary" disabled={launcher.busy || operationBusy} onClick={() => void launcher.restart()}>Restart Riot with presence controls</button> : <button type="button" className="btn-modal-secondary" disabled={launcher.busy} onClick={() => void launcher.retry().catch(() => {})}>Retry presence</button>}</div>
}
