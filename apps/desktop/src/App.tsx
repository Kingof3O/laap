import { useEffect, useState } from 'react'
import { Header, SubNavbar, SettingsModal } from './shared/ui'
import { ToastProvider, useToast } from './context/ToastContext'
import { PersonalRosterView } from './features/personal-roster'
import { TeamVaultView } from './features/team-vault'
import { useAuth } from './features/auth'
import { VIEW_MODE_KEY } from './lib/constants'
import { apiRequest, hasTauri, invokeTauri } from './lib/api'
import type { AppMode, Region, ViewMode } from './lib/types'

function AppContent() {
  const [appMode, setAppMode] = useState<AppMode>('local')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || 'grid'
    } catch {
      return 'grid'
    }
  })
  const [selectedRegion, setSelectedRegion] = useState<Region>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [localCount, setLocalCount] = useState(0)
  const [cloudCount, setCloudCount] = useState(0)
  const [busy, setBusy] = useState(false)

  const { user, login, logout, error: authError, loading: loginBusy } = useAuth()
  const { showSuccess, showError } = useToast()

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode)
    } catch {}
  }

  // Keyboard shortcut listener (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('.search-input')?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleResetRiot = async () => {
    if (!hasTauri) return
    setBusy(true)
    try {
      await invokeTauri('cleanup_account_session')
      showSuccess('Personal Riot settings restored.')
      setShowSettingsModal(false)
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-container">
      {/* Top Header */}
      <Header
        appMode={appMode}
        onModeChange={setAppMode}
        user={user}
        onRefresh={() => setSelectedRegion((prev) => prev)}
        onOpenSettings={() => setShowSettingsModal(true)}
      />

      {/* Sub Navigation Bar */}
      {appMode === 'local' || user ? (
        <SubNavbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedRegion={selectedRegion}
          onRegionChange={setSelectedRegion}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          onAddAccount={appMode === 'local' ? () => setShowAddModal(true) : undefined}
          addButtonLabel={appMode === 'local' ? 'Add Profile' : undefined}
          totalCount={appMode === 'local' ? localCount : cloudCount}
        />
      ) : null}

      {/* Main Content Stage */}
      <main className="main-viewport">
        {appMode === 'local' ? (
          <PersonalRosterView
            searchQuery={searchQuery}
            selectedRegion={selectedRegion}
            viewMode={viewMode}
            isAdmin={user?.role === 'admin'}
            showAddModal={showAddModal}
            onCloseAddModal={() => setShowAddModal(false)}
            onOpenAddModal={() => setShowAddModal(true)}
            onPushToCloud={async (name, region, sessionBlob) => {
              const result = await apiRequest<{ accountId: string }>('/api/accounts', {
                method: 'POST',
                body: JSON.stringify({
                  displayName: name,
                  externalId: `riot-${Date.now()}`,
                  region,
                  status: 'available',
                }),
              })
              await apiRequest(`/api/accounts/${result.accountId}/session-blob`, {
                method: 'PUT',
                body: JSON.stringify({ sessionBlob }),
              })
              showSuccess(`Account "${name}" published to Team Vault!`)
            }}
            onCountChange={setLocalCount}
          />
        ) : (
          <TeamVaultView
            user={user}
            searchQuery={searchQuery}
            selectedRegion={selectedRegion}
            viewMode={viewMode}
            onLogin={async (em, pw, rem) => {
              await login(em, pw, rem)
            }}
            loginBusy={loginBusy}
            authError={authError}
            onCountChange={setCloudCount}
          />
        )}
      </main>

      {/* Settings Modal */}
      <SettingsModal
        user={user}
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onResetRiot={handleResetRiot}
        onLogout={async () => {
          await logout()
          setShowSettingsModal(false)
        }}
        busy={busy}
      />
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}
