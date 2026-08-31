import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowRight, CheckCircle2, KeyRound, LogIn, Monitor, RefreshCcw, ShieldCheck, Square } from 'lucide-react'

const API_BASE = 'https://laap-api.hussiensalah100.workers.dev'
type RuntimeSnapshot = { riot_client: boolean; league_client: boolean; game: boolean }
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>
type Account = { id: string; name: string; region: string; status: string; lastUsed: string; level: number; accent: string }
type User = { id: string; email: string; displayName: string; role: 'admin' | 'operator'; status: string }

async function invokeTauri<T>(command: string, args?: Record<string, unknown>) { return (await import('@tauri-apps/api/core')).invoke<T>(command, args) }
const invoke: Invoke | null = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? invokeTauri : null

async function apiRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, { ...init, credentials: 'include', headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } })
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } }
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed (${response.status})`)
  return body as T
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [processes, setProcesses] = useState<RuntimeSnapshot>({ riot_client: false, league_client: false, game: false })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [launchRequested, setLaunchRequested] = useState(false)
  const [leaseLost, setLeaseLost] = useState(false)
  const runtimeSeen = useRef(false)
  const launchRequestedAt = useRef<number | null>(null)
  const heartbeatFailures = useRef(0)

  const refreshRuntime = async () => {
    if (!invoke) return
    try { setPublicKey(await invoke<string>('device_public_key')); setProcesses(await invoke<RuntimeSnapshot>('runtime_snapshot')); setError(null) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  const loadAccounts = async () => { const result = await apiRequest<{ accounts: Account[] }>('/api/accounts'); setAccounts(result.accounts); setSelectedAccount((current) => current || result.accounts[0]?.id || '') }
  const loadSession = async () => { try { const result = await apiRequest<{ user: User | null }>('/api/auth/session'); setUser(result.user); if (result.user) await loadAccounts() } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }
  useEffect(() => { void refreshRuntime(); void loadSession(); const timer = window.setInterval(() => { void refreshRuntime() }, 15_000); return () => window.clearInterval(timer) }, [])
  useEffect(() => {
    if (!user || !invoke) return
    void (async () => {
      try {
        const key = await invoke<string>('device_public_key')
        setPublicKey(key)
        const result = await apiRequest<{ deviceId: string }>('/api/devices', { method: 'POST', body: JSON.stringify({ publicKey: key, platform: /win/i.test(navigator.userAgent) ? 'windows' : 'macos', deviceName: navigator.platform || 'LAAP Desktop', appVersion: '0.1.0' }) })
        setDeviceId(result.deviceId)
      } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    })()
  }, [user])
  useEffect(() => {
    if (!sessionId || !user) return
    const timer = window.setInterval(() => {
      const runtimeState = processes.game ? 'IN_GAME' : processes.league_client ? 'IN_CLIENT' : processes.riot_client ? 'LAUNCHING' : 'EXITED'
      void apiRequest(`/api/leases/${sessionId}/heartbeat`, { method: 'POST', body: JSON.stringify({ runtimeState }) }).then(() => { heartbeatFailures.current = 0 }).catch((cause) => {
        if (cause instanceof TypeError) { heartbeatFailures.current += 1; if (heartbeatFailures.current < 3) return }
        setSessionId(null); setLaunchRequested(false); launchRequestedAt.current = null; setLeaseLost(true); setError('Lease lost. Sign in again to reacquire the account.')
      })
    }, 20_000)
    return () => window.clearInterval(timer)
  }, [sessionId, user, processes])
  useEffect(() => {
    const running = processes.riot_client || processes.league_client || processes.game
    if (sessionId && running) runtimeSeen.current = true
    if (sessionId && runtimeSeen.current && !running) {
      void apiRequest(`/api/leases/${sessionId}/release`, { method: 'POST', body: JSON.stringify({ reason: 'process_exit' }) }).catch(() => undefined)
      setSessionId(null)
      setLaunchRequested(false)
      runtimeSeen.current = false
      setLeaseLost(true); setError('Lease lost because the Riot/League process exited.')
    }
    if (sessionId && launchRequested && launchRequestedAt.current && !running && Date.now() - launchRequestedAt.current > 60_000) {
      void apiRequest(`/api/leases/${sessionId}/release`, { method: 'POST', body: JSON.stringify({ reason: 'process_exit' }) }).catch(() => undefined)
      setSessionId(null); setLaunchRequested(false); launchRequestedAt.current = null; setLeaseLost(false); setError('Logged out / Riot client closed before authentication.')
    }
  }, [launchRequested, processes, sessionId])

  const runtimeLabel = useMemo(() => leaseLost ? 'Lease lost' : processes.game ? 'League running' : processes.riot_client || processes.league_client || launchRequested ? 'Waiting for Riot login' : sessionId ? 'Lease acquired' : 'Logged out / Riot client closed', [launchRequested, leaseLost, processes, sessionId])
  const login = async () => { setBusy(true); setError(null); try { const result = await apiRequest<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); setUser(result.user); setPassword(''); await loadAccounts() } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const acquire = async () => { if (!deviceId || !selectedAccount || !invoke) { setError('Bind this desktop to an account before acquiring a lease.'); return }; setBusy(true); setError(null); try { const nonce = `${Date.now()}:${selectedAccount}`; const signature = await invoke<string>('sign_device_nonce', { nonce }); const result = await apiRequest<{ sessionId: string }>('/api/leases/acquire', { method: 'POST', body: JSON.stringify({ accountId: selectedAccount, deviceId, nonce, signature }) }); setSessionId(result.sessionId); setLeaseLost(false); setError(null) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const launchRiot = async () => { if (!invoke) return; setBusy(true); setError(null); try { await invoke('launch_riot_client'); setLaunchRequested(true); launchRequestedAt.current = Date.now() } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setBusy(false) } }
  const release = async (reason: 'manual' | 'logout' | 'process_exit' = 'manual') => { if (!sessionId) return; await apiRequest(`/api/leases/${sessionId}/release`, { method: 'POST', body: JSON.stringify({ reason }) }).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause))); setSessionId(null); setLaunchRequested(false); setLeaseLost(false); launchRequestedAt.current = null; runtimeSeen.current = false }
  const logout = async () => { await release('logout'); await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined); setUser(null); setAccounts([]); setDeviceId(null); setSessionId(null); setLaunchRequested(false); setLeaseLost(false) }

  if (!user) return <div className="desktop-app"><div className="desktop-glow" aria-hidden="true" /><main className="desktop-main login-shell"><div className="brand-lockup"><span className="brand-mark"><ShieldCheck aria-hidden="true" size={18} /></span><div><p className="brand-title">LAAP Desktop</p><p className="brand-subtitle">Secure operator shell</p></div></div><section className="desktop-card login-card"><p className="eyebrow">Trusted access</p><h1>Sign in to your workspace.</h1><p className="card-note">Use the operator account created by an administrator. Credentials stay in memory and are sent only over TLS.</p><label>Email<input className="desktop-input" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input className="desktop-input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error ? <p className="desktop-error" role="alert">{error}</p> : null}<button type="button" className="launch-button" onClick={() => void login()} disabled={busy || !email || !password}><span><LogIn aria-hidden="true" size={17} />{busy ? 'Signing in…' : 'Sign in'}</span><ArrowRight aria-hidden="true" size={17} /></button></section></main></div>
  return <div className="desktop-app"><div className="desktop-glow" aria-hidden="true" /><header className="desktop-header"><div className="brand-mark"><ShieldCheck aria-hidden="true" size={18} /></div><div><p className="brand-title">LAAP Desktop</p><p className="brand-subtitle">Secure operator shell</p></div><div className="header-actions"><button type="button" className="refresh-button" onClick={() => void refreshRuntime()} aria-label="Refresh device status"><RefreshCcw aria-hidden="true" size={16} /></button><button type="button" className="refresh-button" onClick={() => void logout()} aria-label="Sign out">×</button></div></header><main className="desktop-main"><section className="desktop-hero"><div><p className="eyebrow">{user.displayName} · {user.role}</p><h1>Ready when you are.</h1><p>Device identity, account leases, and Riot process state stay local to this signed shell.</p></div><span className="desktop-status"><span className="live-dot" aria-hidden="true" />{runtimeLabel}</span></section><section className="desktop-grid"><article className="desktop-card"><div className="card-heading"><span className="card-icon card-icon-cyan"><KeyRound aria-hidden="true" size={17} /></span><div><h2>Device binding</h2><p>OS keychain-backed identity</p></div></div><div className="key-row"><span className="status-check"><CheckCircle2 aria-hidden="true" size={14} />{deviceId ? 'Registered' : 'Binding…'}</span><code>{publicKey ? `${publicKey.slice(0, 10)}…${publicKey.slice(-8)}` : 'Unavailable'}</code></div><p className="card-note">Private key material never enters the browser or filesystem.</p></article><article className="desktop-card"><div className="card-heading"><span className="card-icon card-icon-violet"><Activity aria-hidden="true" size={17} /></span><div><h2>Runtime monitor</h2><p>15-second process heartbeat</p></div></div><div className="process-list"><Process label="Riot Client" active={processes.riot_client} /><Process label="League Client" active={processes.league_client} /><Process label="3D Game" active={processes.game} /></div></article></section><section className="desktop-card launcher-card"><div className="card-heading"><span className="card-icon card-icon-cyan"><Monitor aria-hidden="true" size={17} /></span><div><h2>Account lease</h2><p>Only assigned accounts are available</p></div></div><select className="desktop-input" value={selectedAccount} onChange={(event) => setSelectedAccount(event.target.value)}><option value="">Select an assigned account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.region}</option>)}</select>{sessionId ? <><button type="button" className="launch-button" onClick={() => void launchRiot()} disabled={busy || !invoke}><span><Monitor aria-hidden="true" size={17} />{launchRequested ? 'Waiting for Riot login…' : 'Open Riot Client'}</span><ArrowRight aria-hidden="true" size={17} /></button><button type="button" className="launch-button danger" onClick={() => void release()}><span><Square aria-hidden="true" size={16} />Release lease</span></button></> : <button type="button" className="launch-button" onClick={() => void acquire()} disabled={busy || !deviceId || !selectedAccount || !invoke}><span><Monitor aria-hidden="true" size={17} />{busy ? 'Acquiring…' : 'Acquire account lease'}</span><ArrowRight aria-hidden="true" size={17} /></button>}<p className="desktop-footnote">LAAP never supplies Riot passwords. Sign in inside Riot Client, then return when the client is authenticated.</p></section>{error ? <p className="desktop-error" role="alert">{error}</p> : null}</main></div>
}

function Process({ label, active }: { label: string; active: boolean }) { return <div className="process-row"><span className={`process-dot ${active ? 'process-dot-active' : ''}`} aria-hidden="true" /><span>{label}</span><span className={active ? 'process-state-active' : 'process-state'}>{active ? 'Detected' : 'Not running'}</span></div> }
