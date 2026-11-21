import { useTrayActions } from './hooks/useTrayActions'
import { useLauncher } from './hooks/useLauncher'
import { PresenceBanner, PresenceSelect } from './shared/ui/PresenceControls'
import { useEffect, useRef, useState } from 'react'
import { Header, SubNavbar, SettingsModal, WindowTitleBar } from './shared/ui'
import { UpdateModal } from './shared/ui/UpdateModal'
import { ToastProvider, useToast } from './context/ToastContext'
import { I18nProvider } from './context/I18nContext'
import { GameProvider, useGame } from './context/GameContext'
import { PersonalRosterView } from './features/personal-roster'
import { useUpdateChecker } from './hooks/useUpdateChecker'
import { VIEW_MODE_KEY } from './lib/constants'
import { BillingModal } from './features/billing/BillingModal'
import { useBilling, type ProfileSlots } from './features/billing/useBilling'
import { hasTauri, invokeTauri } from './lib/api'
import {
  RiotOperationsProvider,
  useRiotOperations,
} from './context/RiotOperations'
import { isNewerVersion } from './hooks/useUpdateChecker'
import { product } from './product/flavors'
import { CommandPalette } from './shared/ui/CommandPalette'
import { AccountComparisonModal } from './shared/ui/AccountComparisonModal'
import type { SortOrder } from './lib/sorting'
import type { LocalAccountSummary, Region, ViewMode } from './lib/types'

function AppContent() {
  const { activeGame, setActiveGame } = useGame()
  const operations = useRiotOperations()
  const launcher = useLauncher()
  const activeOperations = useRef(false)
  const [sortOrder, setSortOrder] = useState<SortOrder>('name-asc')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || 'grid'
    } catch {
      return 'grid'
    }
  })
  useEffect(() => {
    const syncViewMode = () => {
      const mode = localStorage.getItem(VIEW_MODE_KEY)
      if (mode === 'grid' || mode === 'list') setViewMode(mode)
    }
    window.addEventListener('laap:viewmode-change', syncViewMode)
    return () => window.removeEventListener('laap:viewmode-change', syncViewMode)
  }, [])
  const [selectedRegion, setSelectedRegion] = useState<Region>('ALL')
  const [selectedRank, setSelectedRank] = useState('all')
  const [rankOptions, setRankOptions] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [localCount, setLocalCount] = useState(0)
  const [profileSlots, setProfileSlots] = useState<ProfileSlots | null>(null)
  const [showBilling, setShowBilling] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showCompareModal, setShowCompareModal] = useState(false)
  const [rawAccounts, setRawAccounts] = useState<LocalAccountSummary[]>([])
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favoriteCount, setFavoriteCount] = useState(0)
  const billing = useBilling()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const fetchAccounts = async () => {
      if (!hasTauri) return
      try {
        const list = await invokeTauri<LocalAccountSummary[]>('list_local_accounts')
        if (Array.isArray(list)) setRawAccounts(list)
      } catch {}
    }
    void fetchAccounts()
    window.addEventListener('laap:refresh', fetchAccounts)
    window.addEventListener('laap:roster-updated', fetchAccounts)
    return () => {
      window.removeEventListener('laap:refresh', fetchAccounts)
      window.removeEventListener('laap:roster-updated', fetchAccounts)
    }
  }, [])

  const { showSuccess, showError } = useToast()
  const openAddProfile = () => {
    if (profileSlots?.canAdd === false) {
      if (profileSlots.chooseCount > 0) showError('Choose your two active Basic profiles first.')
      else if (billing.status?.available) setShowBilling(true)
      else showError('Basic supports two active profiles. Remove a profile to free a slot.')
      return
    }
    setShowAddModal(true)
  }

  const [trayRequest, setTrayRequest] = useState<{
    id: string
    sequence: number
  } | null>(null)
  useTrayActions(
    launcher,
    activeGame,
    (id) => {
      setTrayRequest({ id, sequence: Date.now() })
    },
    showError,
  )

  const {
    currentVersion,
    checking: checkingUpdates,
    status: updateStatus,
    downloadProgress,
    installError,
    updateAvailable,
    latestRelease,
    lastChecked,
    autoCheckOnLaunch,
    setAutoCheckOnLaunch,
    checkForUpdates,
    downloadAndInstallUpdate,
    dismissUpdate,
    openReleasePage,
  } = useUpdateChecker()

  useEffect(() => {
    if (
      selectedRank.startsWith('rank:') &&
      !rankOptions.some((rank) => `rank:${rank.toLowerCase()}` === selectedRank)
    ) {
      setSelectedRank('all')
    }
  }, [rankOptions, selectedRank])

  const handleManualCheckUpdates = async () => {
    try {
      const release = await checkForUpdates(true)
      if (release && !isNewerVersion(release.version, currentVersion))
        showSuccess(`${product.name} is up to date (v${currentVersion}).`)
    } catch (error) {
      showError('Unable to check for updates (Offline/Blocked)')
      throw error
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
    const operation = (event: Event) => {
      activeOperations.current = (event as CustomEvent<boolean>).detail
    }
    window.addEventListener('laap:operation', operation)
    const recover = () => {
      if (!activeOperations.current && !operations.provisioning)
        void invokeTauri('recover_orphaned_account_session').catch(() => {})
    }
    recover()
    const timer = window.setInterval(recover, 30_000)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('laap:operation', operation)
    }
  }, [operations.provisioning])

  // Keyboard shortcut listener (Cmd+K / Ctrl+K) -> Toggle Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowCommandPalette((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleResetRiot = async () => {
    if (!hasTauri) return
    setBusy(true)
    try {
      await operations.run(async (confirmed) => {
        await invokeTauri('cancel_provisioning_session', { confirmed })
        await invokeTauri('cleanup_account_session', { confirmed })
      })
      window.dispatchEvent(
        new CustomEvent('laap:provisioning', { detail: false }),
      )
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
      <WindowTitleBar>
      <Header
        brandLabel={billing.status?.pro ? 'LAAP Pro' : undefined}
        isPro={Boolean(billing.status?.pro)}
        onOpenBilling={billing.status?.available ? () => setShowBilling(true) : undefined}
        onOpenPalette={() => setShowCommandPalette(true)}
        onOpenCompare={() => setShowCompareModal(true)}
        updateAvailable={updateAvailable}
        onOpenUpdates={() => setShowUpdateModal(true)}
        onRefresh={() => window.dispatchEvent(new Event('laap:refresh'))}
        onOpenSettings={() => setShowSettingsModal(true)}
        presenceControl={activeGame === 'league' ? <PresenceSelect launcher={launcher} operationBusy={operations.busy || operations.provisioning} /> : undefined}
        billingControl={billing.status?.available ? <button type="button" className="btn-secondary billing-header-button" onClick={() => setShowBilling(true)}>
          {billing.status.pro ? 'Manage Pro' : 'Upgrade'}
        </button> : undefined}
        riotRunning={operations.running}
        operationBusy={operations.busy || operations.provisioning}
        onStopRiot={async () => {
          try {
            await operations.run((confirmed) =>
              invokeTauri('close_riot_client', { confirmed }),
            )
            showSuccess('Riot stopped. Saved logins preserved.')
          } catch (cause) {
            showError(String(cause))
          }
        }}
      />
      </WindowTitleBar>

      {activeGame === 'league' && (
        <PresenceBanner
          launcher={launcher}
          operationBusy={operations.busy || operations.provisioning}
        />
      )}

      {/* Sub Navigation Bar */}
      <SubNavbar
        activeGame={activeGame}
        onGameChange={setActiveGame}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedRegion={selectedRegion}
        onRegionChange={setSelectedRegion}
        selectedRank={selectedRank}
        rankOptions={rankOptions}
        onRankChange={setSelectedRank}
        sortOrder={sortOrder}
        onSortChange={setSortOrder}
        favoritesOnly={favoritesOnly}
        onFavoritesOnlyChange={setFavoritesOnly}
        favoriteCount={favoriteCount}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onAddAccount={openAddProfile}
        addButtonLabel={activeGame === 'valorant' ? 'Add VALORANT Profile' : 'Add Profile'}
        totalCount={localCount}
      />

      {/* Main Content Stage */}
      <main className="main-viewport" tabIndex={0}>
          <PersonalRosterView
            activeGame={activeGame}
            onGameChange={setActiveGame}
            trayRequest={trayRequest}
            onTrayRequestHandled={() => setTrayRequest(null)}
            searchQuery={searchQuery}
            selectedRegion={selectedRegion}
            selectedRank={selectedRank}
            onRankOptionsChange={setRankOptions}
            sortOrder={sortOrder}
            onSortChange={setSortOrder}
            favoritesOnly={favoritesOnly}
            onFavoritesOnlyChange={setFavoritesOnly}
            onFavoriteCountChange={setFavoriteCount}
            viewMode={viewMode}
            showAddModal={showAddModal}
            onCloseAddModal={() => setShowAddModal(false)}
            onOpenAddModal={openAddProfile}
            onCountChange={setLocalCount}
            onSlotsChange={setProfileSlots}
          />
      </main>

      {showBilling && billing.status && <BillingModal status={billing.status} onStatus={billing.apply} onClose={() => setShowBilling(false)} />}

      {/* Settings Modal */}
      <SettingsModal
        launcher={launcher}
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onResetRiot={handleResetRiot}
        onCheckUpdates={handleManualCheckUpdates}
        checkingUpdates={checkingUpdates}
        updateStatus={updateStatus}
        downloadProgress={downloadProgress}
        installError={installError}
        onInstallUpdate={downloadAndInstallUpdate}
        busy={busy || operations.busy}
        lastChecked={lastChecked}
        updateAvailable={updateAvailable}
        latestRelease={latestRelease}
        autoCheckOnLaunch={autoCheckOnLaunch}
        onToggleAutoCheck={setAutoCheckOnLaunch}
        onOpenReleaseNotes={openReleasePage}
        onOpenReleaseModal={() => {
          setShowSettingsModal(false)
          setShowUpdateModal(true)
        }}
        currentVersion={currentVersion}
        billingStatus={billing.status}
        onOpenBilling={() => {
          setShowSettingsModal(false)
          setShowBilling(true)
        }}
      />

      {/* Update Available Modal */}
      <UpdateModal
        isOpen={updateAvailable || showUpdateModal}
        currentVersion={currentVersion}
        release={latestRelease}
        status={updateStatus}
        downloadProgress={downloadProgress}
        installError={installError}
        onDownload={openReleasePage}
        onInstall={downloadAndInstallUpdate}
        onDismiss={(forever) => {
          dismissUpdate(forever)
          setShowUpdateModal(false)
        }}
      />
      {/* Universal Command Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        accounts={rawAccounts}
        activeGame={activeGame}
        onSwitchGame={setActiveGame}
        onLaunchAccount={(id) => {
          setTrayRequest({ id, sequence: Date.now() })
        }}
        onOpenAddModal={openAddProfile}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenCompare={() => setShowCompareModal(true)}
        onRefreshAll={() => window.dispatchEvent(new Event('laap:refresh'))}
      />

      {/* Multi-Account Comparison Matrix */}
      <AccountComparisonModal
        isOpen={showCompareModal}
        onClose={() => setShowCompareModal(false)}
        accounts={rawAccounts}
        activeGame={activeGame}
        onLaunchAccount={(id) => {
          setTrayRequest({ id, sequence: Date.now() })
        }}
      />
    </div>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <GameProvider>
        <ToastProvider>
          <RiotOperationsProvider>
            <AppContent />
          </RiotOperationsProvider>
        </ToastProvider>
      </GameProvider>
    </I18nProvider>
  )
}
