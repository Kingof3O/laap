import { useTrayActions } from './hooks/useTrayActions'
import { useLauncher } from './hooks/useLauncher'
import { PresenceBanner, PresenceSelect } from './shared/ui/PresenceControls'
import { useEffect, useRef, useState, type ReactNode, type ComponentProps } from 'react'
import { Header, SubNavbar, SettingsModal, WindowTitleBar } from './shared/ui'
import { UpdateModal } from './shared/ui/UpdateModal'
import { ToastProvider, useToast } from './context/ToastContext'
import { PersonalRosterView } from './features/personal-roster'
import { useUpdateChecker } from './hooks/useUpdateChecker'
import { VIEW_MODE_KEY } from './lib/constants'
import { hasTauri, invokeTauri } from './lib/api'
import {
  RiotOperationsProvider,
  useRiotOperations,
} from './context/RiotOperations'
import { isNewerVersion } from './hooks/useUpdateChecker'
import type { SortOrder } from './lib/sorting'
import type { Region, ViewMode } from './lib/types'

interface AppProps {
  navigation?: ReactNode
  studio?: ReactNode
  onShowAccounts?: () => void
  profileActions?: ComponentProps<typeof PersonalRosterView>['profileActions']
}

function AppContent({ navigation, studio, onShowAccounts, profileActions }: AppProps) {
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
  const [busy, setBusy] = useState(false)

  const { showSuccess, showError } = useToast()

  const [trayRequest, setTrayRequest] = useState<{
    id: string
    sequence: number
  } | null>(null)
  useTrayActions(
    launcher,
    (id) => {
      onShowAccounts?.()
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
        showSuccess(`LAAP Desktop is up to date (v${currentVersion}).`)
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
    <div className={studio ? "app-container studio-active" : "app-container"}>
      <WindowTitleBar>
      <Header
        navigation={navigation}
        updateAvailable={updateAvailable}
        onOpenUpdates={() => setShowUpdateModal(true)}
        onRefresh={() => window.dispatchEvent(new Event('laap:refresh'))}
        onOpenSettings={() => setShowSettingsModal(true)}
        presenceControl={<PresenceSelect launcher={launcher} operationBusy={operations.busy || operations.provisioning} />}
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

      <PresenceBanner
        launcher={launcher}
        operationBusy={operations.busy || operations.provisioning}
      />

      {/* Sub Navigation Bar */}
      {!studio && (
        <SubNavbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedRegion={selectedRegion}
          onRegionChange={setSelectedRegion}
          selectedRank={selectedRank}
          rankOptions={rankOptions}
          onRankChange={setSelectedRank}
          sortOrder={sortOrder}
          onSortChange={setSortOrder}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          onAddAccount={() => setShowAddModal(true)}
          addButtonLabel="Add Profile"
          totalCount={localCount}
        />
      )}

      {/* Main Content Stage */}
      {studio && <section className="main-viewport">{studio}</section>}
      <main className="main-viewport" style={studio ? { display: 'none' } : undefined}>
          <PersonalRosterView
            profileActions={profileActions}
            trayRequest={trayRequest}
            onTrayRequestHandled={() => setTrayRequest(null)}
            searchQuery={searchQuery}
            selectedRegion={selectedRegion}
            selectedRank={selectedRank}
            onRankOptionsChange={setRankOptions}
            sortOrder={sortOrder}
            viewMode={viewMode}
            showAddModal={showAddModal}
            onCloseAddModal={() => setShowAddModal(false)}
            onOpenAddModal={() => setShowAddModal(true)}
            onCountChange={setLocalCount}
          />
      </main>

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
        onOpenReleaseModal={() => {
          setShowSettingsModal(false)
          setShowUpdateModal(true)
        }}
        currentVersion={currentVersion}
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
    </div>
  )
}

export default function App(props: AppProps) {
  return (
    <ToastProvider>
      <RiotOperationsProvider>
        <AppContent {...props} />
      </RiotOperationsProvider>
    </ToastProvider>
  )
}
