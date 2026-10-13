import { useEffect, useState } from 'react'
import { Header, SubNavbar, SettingsModal } from './shared/ui'
import { UpdateModal } from './shared/ui/UpdateModal'
import { ToastProvider, useToast } from './context/ToastContext'
import { PersonalRosterView } from './features/personal-roster'
import { TeamVaultView } from './features/team-vault'
import { useAuth } from './features/auth'
import { useUpdateChecker } from './hooks/useUpdateChecker'
import { VIEW_MODE_KEY } from './lib/constants'
import { apiRequest, hasTauri, invokeTauri, IS_OFFLINE_ONLY } from './lib/api'
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
  const [selectedRank, setSelectedRank] = useState('all')
  const [rankOptions, setRankOptions] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [localCount, setLocalCount] = useState(0)
  const [cloudCount, setCloudCount] = useState(0)
  const [busy, setBusy] = useState(false)

  const { user, login, logout, error: authError, loading: loginBusy } = useAuth()
  const { showSuccess, showError } = useToast()
  const {
    currentVersion,
    checking: checkingUpdates,
    updateAvailable,
    latestRelease,
    checkForUpdates,
    dismissUpdate,
    openReleasePage,
  } = useUpdateChecker()

  useEffect(() => {
    if (selectedRank.startsWith('rank:') && !rankOptions.some((rank) => `rank:${rank.toLowerCase()}` === selectedRank)) {
      setSelectedRank('all')
    }
  }, [rankOptions, selectedRank])

  const handleManualCheckUpdates = async () => {
    const release = await checkForUpdates(true)
    if (!release) {
      showSuccess(`LAAP Desktop is up to date (v${currentVersion}).`)
    }
  }

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode)
    } catch {}
  }

  // Recover settings left behind if the previous desktop process crashed.
  useEffect(() => {
    if (!hasTauri) return
    const recover = () => { void invokeTauri('recover_orphaned_account_session').catch(() => {}) }
    recover()
    const timer = window.setInterval(recover, 30_000)
    return () => window.clearInterval(timer)
  }, [])

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
        onModeChange={(m) => {
          if (!IS_OFFLINE_ONLY) setAppMode(m)
        }}
        user={IS_OFFLINE_ONLY ? null : user}
        onRefresh={() => window.dispatchEvent(new Event('laap:refresh'))}
        onOpenSettings={() => setShowSettingsModal(true)}
        isOfflineOnly={IS_OFFLINE_ONLY}
      />

      {/* Sub Navigation Bar */}
      {appMode === 'local' || user ? (
        <SubNavbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedRegion={selectedRegion}
          onRegionChange={setSelectedRegion}
          selectedRank={selectedRank}
          rankOptions={rankOptions}
          onRankChange={appMode === 'local' ? setSelectedRank : undefined}
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
            selectedRank={selectedRank}
            onRankOptionsChange={setRankOptions}
            viewMode={viewMode}
            isAdmin={!IS_OFFLINE_ONLY && user?.role === 'admin'}
            showAddModal={showAddModal}
            onCloseAddModal={() => setShowAddModal(false)}
            onOpenAddModal={() => setShowAddModal(true)}
            onPushToCloud={!IS_OFFLINE_ONLY && user?.role === 'admin' ? async (name, region, sessionBlob) => {
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
              showSuccess(`Account "${name}" published to Shared Accounts!`)
            } : undefined}
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
        user={IS_OFFLINE_ONLY ? null : user}
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onResetRiot={handleResetRiot}
        onLogout={async () => {
          await logout()
          setShowSettingsModal(false)
        }}
        onCheckUpdates={handleManualCheckUpdates}
        checkingUpdates={checkingUpdates}
        busy={busy}
      />

      {/* Update Available Modal */}
      <UpdateModal
        isOpen={updateAvailable}
        currentVersion={currentVersion}
        release={latestRelease}
        onDownload={openReleasePage}
        onDismiss={dismissUpdate}
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
