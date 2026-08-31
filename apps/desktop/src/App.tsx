import { useEffect, useState } from 'react'
import { Activity, ArrowRight, CheckCircle2, KeyRound, Monitor, RefreshCcw, ShieldCheck } from 'lucide-react'

type RuntimeSnapshot = { riot_client: boolean; league_client: boolean; game: boolean }
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>

async function invokeTauri<T>(command: string, args?: Record<string, unknown>) {
  return (await import('@tauri-apps/api/core')).invoke<T>(command, args)
}

const invoke: Invoke | null = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? invokeTauri : null

export default function App() {
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [processes, setProcesses] = useState<RuntimeSnapshot>({ riot_client: false, league_client: false, game: false })
  const [error, setError] = useState<string | null>(null)
  const refresh = async () => {
    if (!invoke) return
    try { setPublicKey(await invoke<string>('device_public_key')); setProcesses(await invoke<RuntimeSnapshot>('runtime_snapshot')); setError(null) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 15_000); return () => window.clearInterval(timer) }, [])
  const state = processes.game ? 'In game' : processes.league_client ? 'In client' : processes.riot_client ? 'Launching' : 'Idle'
  return <div className="desktop-app"><div className="desktop-glow" aria-hidden="true" /><header className="desktop-header"><div className="brand-mark"><ShieldCheck aria-hidden="true" size={18} /></div><div><p className="brand-title">LAAP Desktop</p><p className="brand-subtitle">Secure local agent</p></div><button type="button" className="refresh-button" onClick={() => void refresh()} aria-label="Refresh device status"><RefreshCcw aria-hidden="true" size={16} /></button></header><main className="desktop-main"><section className="desktop-hero"><div><p className="eyebrow">Trusted runtime</p><h1>Ready when you are.</h1><p>Device identity and Riot process state stay local to this signed desktop shell.</p></div><span className="desktop-status"><span className="live-dot" aria-hidden="true" />{state}</span></section><section className="desktop-grid"><article className="desktop-card"><div className="card-heading"><span className="card-icon card-icon-cyan"><KeyRound aria-hidden="true" size={17} /></span><div><h2>Device binding</h2><p>OS keychain-backed identity</p></div></div><div className="key-row"><span className="status-check"><CheckCircle2 aria-hidden="true" size={14} />Active</span><code>{publicKey ? `${publicKey.slice(0, 10)}…${publicKey.slice(-8)}` : 'Connect the Tauri shell'}</code></div><p className="card-note">Private key material never enters the browser or filesystem.</p></article><article className="desktop-card"><div className="card-heading"><span className="card-icon card-icon-violet"><Activity aria-hidden="true" size={17} /></span><div><h2>Runtime monitor</h2><p>15-second process heartbeat</p></div></div><div className="process-list"><Process label="Riot Client" active={processes.riot_client} /><Process label="League Client" active={processes.league_client} /><Process label="3D Game" active={processes.game} /></div></article></section>{error ? <p className="desktop-error" role="alert">{error}</p> : null}<button type="button" className="launch-button" disabled={!invoke}><span><Monitor aria-hidden="true" size={17} />Open account launcher</span><ArrowRight aria-hidden="true" size={17} /></button><p className="desktop-footnote">Lease claims require an active assignment, a signed device challenge, and a server-issued session.</p></main></div>
}

function Process({ label, active }: { label: string; active: boolean }) { return <div className="process-row"><span className={`process-dot ${active ? 'process-dot-active' : ''}`} aria-hidden="true" /><span>{label}</span><span className={active ? 'process-state-active' : 'process-state'}>{active ? 'Detected' : 'Not running'}</span></div> }
