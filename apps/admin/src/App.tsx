import {
  FileText,
  Gift,
  LayoutDashboard,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PageName } from './lib/data'
import type { AdminUser, AuditData, Customer, GiftCode, OverviewData } from './lib/types'
import { ActivityToast } from './components/ActivityToast'
import { Sidebar, type NavItem } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { api, ApiError } from './lib/api'
import { LoginPage } from './pages/LoginPage'
import { OverviewPage } from './pages/OverviewPage'
import { CustomersPage } from './pages/CustomersPage'
import { GiftsPage } from './pages/GiftsPage'
import { AuditPage } from './pages/AuditPage'

const navItems: NavItem[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Customers', icon: Users },
  { label: 'Gifts', icon: Gift },
  { label: 'Audit', icon: FileText },
]

type AuthState = 'loading' | 'authenticated' | 'unauthenticated'

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Could not communicate with LAAP Billing Worker.'
}

export default function App() {
  const [activePage, setActivePage] = useState<PageName>('Overview')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [authError, setAuthError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null)

  // Data states
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [gifts, setGifts] = useState<GiftCode[]>([])
  const [auditData, setAuditData] = useState<AuditData | null>(null)
  const [loading, setLoading] = useState(false)

  const moduleToast = useCallback((message: string) => setToast(message), [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [overview, custs, gfts, audit] = await Promise.allSettled([
        api.getOverview(),
        api.getCustomers(),
        api.getGifts(),
        api.getAudit(),
      ])

      if (overview.status === 'fulfilled') setOverviewData(overview.value)
      if (custs.status === 'fulfilled') setCustomers(custs.value.customers)
      if (gfts.status === 'fulfilled') setGifts(gfts.value)
      if (audit.status === 'fulfilled') setAuditData(audit.value)
    } finally {
      setLoading(false)
    }
  }, [])

  const bootstrapSession = useCallback(async () => {
    try {
      const session = await api.getSession()
      if (!session.user) {
        setAuthState('unauthenticated')
        return
      }
      setCurrentUser(session.user)
      setAuthState('authenticated')
      void loadAll()
    } catch (err) {
      setAuthState('unauthenticated')
    }
  }, [loadAll])

  useEffect(() => {
    void bootstrapSession()
  }, [bootstrapSession])

  // Background refresh every 30 seconds when authenticated
  useEffect(() => {
    if (authState !== 'authenticated') return
    const timer = setInterval(() => {
      void loadAll().catch(() => {})
    }, 30_000)
    return () => clearInterval(timer)
  }, [authState, loadAll])

  const handleLogout = async () => {
    await api.logout()
    setCurrentUser(null)
    setAuthState('unauthenticated')
    moduleToast('Signed out of LAAP Admin.')
  }

  if (authState === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <img src="/favicon.webp" alt="LAAP" className="h-10 w-10 animate-pulse rounded-xl" />
          <p className="text-xs font-mono text-slate-400">Verifying LAAP Edge session...</p>
        </div>
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return (
      <LoginPage
        onSuccess={bootstrapSession}
        onSendCode={(email) => api.sendOtp(email).then(() => {})}
        onVerifyCode={(email, code) => api.verifyOtp(email, code).then(() => {})}
        error={authError}
      />
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-slate-100 lg:flex-row">
      <Sidebar
        items={navItems}
        activePage={activePage}
        onNavigate={(page) => {
          setActivePage(page)
          setMobileOpen(false)
        }}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[260px]">
        <TopBar activePage={activePage} onMenu={() => setMobileOpen(true)} />

        <main className="flex-1 p-5 sm:p-8 lg:p-10">
          {activePage === 'Overview' ? (
            <OverviewPage
              data={overviewData}
              loading={loading}
              onNavigate={setActivePage}
              onRefresh={loadAll}
            />
          ) : null}

          {activePage === 'Customers' ? (
            <CustomersPage
              customers={customers}
              loading={loading}
              onRefresh={loadAll}
              onToast={moduleToast}
            />
          ) : null}

          {activePage === 'Gifts' ? (
            <GiftsPage
              gifts={gifts}
              loading={loading}
              onRefresh={loadAll}
              onToast={moduleToast}
            />
          ) : null}

          {activePage === 'Audit' ? (
            <AuditPage
              data={auditData}
              loading={loading}
              onRefresh={loadAll}
              onToast={moduleToast}
            />
          ) : null}
        </main>
      </div>

      <ActivityToast message={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
