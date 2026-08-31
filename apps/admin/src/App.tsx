import { ClipboardList, Gamepad2, LayoutDashboard, LaptopMinimal, UserRoundPlus, UsersRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ApiUser, DashboardSnapshot } from '@laap/types'
import type { PageName } from './lib/data'
import { accounts as fallbackAccounts, activity as fallbackActivity, sessions as fallbackSessions } from './lib/data'
import { ActivityToast } from './components/ActivityToast'
import { Sidebar, type NavItem } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { api, ApiError } from './lib/api'
import { LoginPage } from './pages/LoginPage'
import { OverviewPage } from './pages/OverviewPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { AccountsPage } from './pages/AccountsPage'
import { AssignmentsPage } from './pages/AssignmentsPage'
import { DevicesPage } from './pages/DevicesPage'
import { AuditLogPage } from './pages/AuditLogPage'
import { UsersPage } from './pages/UsersPage'

const baseNavItems: NavItem[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Account pool', icon: Gamepad2 },
  { label: 'Assignments', icon: UsersRound },
  { label: 'Users', icon: UserRoundPlus },
  { label: 'Devices', icon: LaptopMinimal },
  { label: 'Audit log', icon: ClipboardList },
]

const demoUser: ApiUser = { id: 'demo-admin', email: 'admin@laap.local', displayName: 'Alex Kim', role: 'admin', status: 'active' }
const fallbackSnapshot: DashboardSnapshot = {
  user: demoUser,
  metrics: { availableAccounts: 48, totalAccounts: 55, activeLeases: 4, inGameLeases: 1, inClientLeases: 1, boundDevices: 12, healthyDevices: 11, authorizedUsers: 24, activeUsers: 18 },
  sessions: fallbackSessions,
  activity: fallbackActivity,
  accounts: fallbackAccounts,
}

type AuthState = 'loading' | 'authenticated' | 'unauthenticated'

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Unable to reach the LAAP API.'
}

export default function App() {
  const [activePage, setActivePage] = useState<PageName>('Overview')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [authError, setAuthError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null)
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [offline, setOffline] = useState(false)

  const loadDashboard = useCallback(async () => {
    try {
      const nextSnapshot = await api.getDashboard()
      setSnapshot(nextSnapshot)
      setCurrentUser(nextSnapshot.user)
      setOffline(false)
      return nextSnapshot
    } catch (error) {
      if (import.meta.env.DEV && !(error instanceof ApiError && error.status === 401)) {
        setSnapshot(fallbackSnapshot)
        setCurrentUser(fallbackSnapshot.user)
        setOffline(true)
        return fallbackSnapshot
      }
      throw error
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const bootstrap = async () => {
      try {
        let session = await api.getSession()
        if (!session.user && import.meta.env.DEV) session = await api.demoLogin()
        if (!session.user) {
          if (!cancelled) setAuthState('unauthenticated')
          return
        }
        if (!cancelled) setCurrentUser(session.user)
        await loadDashboard()
        if (!cancelled) setAuthState('authenticated')
      } catch (error) {
        if (!cancelled && import.meta.env.DEV) {
          setSnapshot(fallbackSnapshot)
          setCurrentUser(fallbackSnapshot.user)
          setOffline(true)
          setAuthState('authenticated')
          setToast('API offline · showing safe preview data')
        } else if (!cancelled) {
          setAuthError(errorMessage(error))
          setAuthState('unauthenticated')
        }
      }
    }
    void bootstrap()
    return () => { cancelled = true }
  }, [loadDashboard])

  useEffect(() => {
    if (authState !== 'authenticated' || offline) return
    const refreshTimer = window.setInterval(() => {
      void loadDashboard().catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          setCurrentUser(null)
          setSnapshot(null)
          setAuthState('unauthenticated')
        } else setToast(errorMessage(error))
      })
    }, 20_000)
    return () => window.clearInterval(refreshTimer)
  }, [authState, offline, loadDashboard])

  const filteredSessions = useMemo(() => {
    const allSessions = snapshot?.sessions ?? fallbackSessions
    const normalized = query.trim().toLowerCase()
    if (!normalized) return allSessions
    return allSessions.filter((session) => [session.account, session.user, session.region, session.device, session.runtimeState].some((value) => value.toLowerCase().includes(normalized)))
  }, [query, snapshot])
  const navigate = (page: PageName) => { setActivePage(page); setMobileOpen(false) }
  const notify = () => setToast('No new alerts · your workspace is healthy')
  const releaseSession = async (session: (typeof fallbackSessions)[number]) => {
    if (offline) { setToast(`Preview mode · force release queued for ${session.account}`); return }
    try { await api.releaseLease(session.id); setToast(`Force release completed for ${session.account}`); await loadDashboard() } catch (error) { setToast(errorMessage(error)) }
  }
  const login = async (email: string, password: string) => {
    try {
      const result = await api.login(email, password)
      if (!result.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in is required')
      await loadDashboard()
      setCurrentUser(result.user)
      setAuthState('authenticated')
      setAuthError(null)
    } catch (error) {
      setCurrentUser(null)
      setSnapshot(null)
      setAuthState('unauthenticated')
      setAuthError(errorMessage(error))
    }
  }
  const logout = async () => { try { await api.logout() } catch { /* session expiry is safe to handle locally */ } setCurrentUser(null); setSnapshot(null); setAuthState('unauthenticated'); setActivePage('Overview') }
  if (authState === 'loading') return <div className="grid min-h-dvh place-items-center bg-canvas text-slate-400"><div className="flex items-center gap-3 text-xs"><span className="live-dot" aria-hidden="true" />Connecting to LAAP API…</div></div>
  if (authState === 'unauthenticated') return <LoginPage onSubmit={login} error={authError} demoAvailable={import.meta.env.DEV} />
  const activeSnapshot = snapshot ?? (import.meta.env.DEV ? fallbackSnapshot : null)
  if (!activeSnapshot) return <div className="grid min-h-dvh place-items-center bg-canvas text-slate-400"><p className="text-sm">Workspace data is unavailable. Please sign in again.</p></div>
  const isAdmin = activeSnapshot.user.role === 'admin'
  const sidebarItems = baseNavItems.filter((item) => isAdmin || !['Assignments', 'Users', 'Audit log'].includes(item.label)).map((item) => item.label === 'Account pool'
    ? { ...item, badge: String(activeSnapshot.metrics.totalAccounts) }
    : item.label === 'Devices'
      ? { ...item, badge: String(activeSnapshot.metrics.boundDevices) }
      : item)
  const moduleToast = (message: string) => setToast(message)
  const content = activePage === 'Overview'
    ? <OverviewPage metrics={activeSnapshot.metrics} sessions={filteredSessions} activity={activeSnapshot.activity} accounts={activeSnapshot.accounts} onRelease={releaseSession} />
    : activePage === 'Account pool'
      ? <AccountsPage initialAccounts={activeSnapshot.accounts} offline={offline} onToast={moduleToast} />
      : activePage === 'Assignments'
          ? <AssignmentsPage initialAccounts={activeSnapshot.accounts} offline={offline} onToast={moduleToast} />
        : activePage === 'Users'
          ? <UsersPage offline={offline} onToast={moduleToast} />
        : activePage === 'Devices'
          ? <DevicesPage offline={offline} onToast={moduleToast} />
          : activePage === 'Audit log'
            ? <AuditLogPage offline={offline} onToast={moduleToast} />
            : <PlaceholderPage page={activePage} />
  return <div className="min-h-dvh overflow-x-hidden bg-canvas text-ink"><div className="ambient ambient-one" aria-hidden="true" /><div className="ambient ambient-two" aria-hidden="true" /><div className="ambient ambient-three" aria-hidden="true" /><div className="app-shell"><Sidebar items={sidebarItems} activePage={activePage} onNavigate={navigate} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} currentUser={currentUser ?? activeSnapshot.user} onLogout={logout} /><div className="min-w-0 flex-1"><TopBar activePage={activePage} onMenu={() => setMobileOpen(true)} query={query} onQueryChange={setQuery} onNotify={notify} /><main id="main-content" tabIndex={-1}>{content}</main></div></div><ActivityToast message={toast} onDismiss={() => setToast(null)} /></div>
}
