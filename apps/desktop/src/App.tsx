import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Play, Square, X } from 'lucide-react'
import { Header } from './components/layout/Header'
import { SubNavbar } from './components/layout/SubNavbar'
import { AccountCard } from './components/accounts/AccountCard'
import { AccountListTable } from './components/accounts/AccountListTable'
import { EmptyState } from './components/accounts/EmptyState'
import { LoginView } from './components/auth/LoginView'
import { AddAccountModal } from './components/modals/AddAccountModal'
import { SyncAccountModal } from './components/modals/SyncAccountModal'
import { DeleteConfirmModal } from './components/modals/DeleteConfirmModal'
import { SettingsModal } from './components/modals/SettingsModal'
import { useAuth } from './hooks/useAuth'
import { useLocalAccounts } from './hooks/useLocalAccounts'
import { useCloudAccounts } from './hooks/useCloudAccounts'
import { VIEW_MODE_KEY } from './lib/constants'
import { hasTauri, invokeTauri } from './lib/api'
import type { Account, AppMode, Region, ViewMode } from './lib/types'

export default function App() {
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

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [syncTarget, setSyncTarget] = useState<Account | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; isCloud: boolean } | null>(null)

  // Status feedback
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Hooks
  const { user, login, logout, error: authError } = useAuth()
  const {
    localAccounts,
    loadAccounts: reloadLocal,
    saveAccount: saveLocal,
    deleteAccount: deleteLocal,
    launchAccount: launchLocal,
    captureActive: captureActiveLocal,
    startSandbox: startLocalSandbox,
    cancelSandbox: cancelLocalSandbox,
    pollSandbox: pollLocalSandbox,
    finishSandbox: finishLocalSandbox,
    provisioning: localProvisioning,
    getFullAccount,
  } = useLocalAccounts()

  const {
    accounts: cloudAccounts,
    loadAccounts: reloadCloud,
    acquireAndLaunch: launchCloud,
    releaseLease: releaseCloud,
    deleteCloudAccount: deleteCloud,
    uploadSessionBlob: uploadCloudBlob,
    createAndUploadAccount: pushLocalToCloud,
    sessionId: cloudSessionId,
    activeAccountId: cloudActiveAccountId,
    startSandbox: startCloudSandbox,
    cancelSandbox: cancelCloudSandbox,
    provisioning: cloudProvisioning,
  } = useCloudAccounts(user)

  // Persist view mode preference
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
        const searchInput = document.querySelector<HTMLInputElement>('.search-input')
        searchInput?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Sandbox Poller for Local Mode
  useEffect(() => {
    if (!localProvisioning) return
    const interval = window.setInterval(async () => {
      try {
        const captured = await pollLocalSandbox()
        if (captured) {
          window.clearInterval(interval)
          setStatusMessage('Session captured! Saving profile…')
          await finishLocalSandbox()
          setShowAddModal(false)
          setStatusMessage('Account saved successfully!')
          await reloadLocal()
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : String(err))
      }
    }, 1500)
    return () => window.clearInterval(interval)
  }, [localProvisioning, pollLocalSandbox, finishLocalSandbox, reloadLocal])

  // Toast Auto-dismiss
  useEffect(() => {
    if (!statusMessage) return
    const timer = window.setTimeout(() => setStatusMessage(null), 4000)
    return () => window.clearTimeout(timer)
  }, [statusMessage])

  useEffect(() => {
    if (!errorMessage) return
    const timer = window.setTimeout(() => setErrorMessage(null), 5000)
    return () => window.clearTimeout(timer)
  }, [errorMessage])

  // Filtered accounts based on search query and region
  const filteredLocalAccounts = useMemo(() => {
    return localAccounts.filter((acc) => {
      const matchRegion = selectedRegion === 'ALL' || acc.region.toUpperCase() === selectedRegion
      const matchSearch =
        !searchQuery.trim() ||
        `${acc.name} ${acc.region}`.toLowerCase().includes(searchQuery.trim().toLowerCase())
      return matchRegion && matchSearch
    })
  }, [localAccounts, selectedRegion, searchQuery])

  const filteredCloudAccounts = useMemo(() => {
    return cloudAccounts.filter((acc) => {
      const matchRegion = selectedRegion === 'ALL' || acc.region.toUpperCase() === selectedRegion
      const matchSearch =
        !searchQuery.trim() ||
        `${acc.name} ${acc.region}`.toLowerCase().includes(searchQuery.trim().toLowerCase())
      return matchRegion && matchSearch
    })
  }, [cloudAccounts, selectedRegion, searchQuery])

  // Actions
  const handleLaunchLocal = async (id: string) => {
    setBusy(true)
    setErrorMessage(null)
    setStatusMessage('Launching League of Legends…')
    try {
      await launchLocal(id)
      setStatusMessage('Game started!')
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleLaunchCloud = async (id: string) => {
    setBusy(true)
    setErrorMessage(null)
    try {
      await launchCloud(id, (step) => setStatusMessage(step))
      setStatusMessage('Launching League of Legends with claimed account!')
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleCaptureLocal = async (name: string, region: string) => {
    setBusy(true)
    setErrorMessage(null)
    try {
      const activeSession = await captureActiveLocal()
      if (!activeSession) {
        throw new Error('No active Riot login found. Please sign into League or Riot Client first.')
      }
      await saveLocal(name, region, activeSession)
      setShowAddModal(false)
      setStatusMessage(`Profile "${name}" registered successfully!`)
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handlePushLocalToCloud = async (localId: string) => {
    if (!user || user.role !== 'admin') return
    setBusy(true)
    setErrorMessage(null)
    setStatusMessage('Publishing account to Team Vault…')
    try {
      const full = await getFullAccount(localId)
      if (!full || !full.session_blob) {
        throw new Error('No valid session stored in this profile.')
      }
      await pushLocalToCloud(full.name, full.region, full.session_blob)
      setStatusMessage(`Account "${full.name}" published to Team Vault!`)
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleLinkLocalToCloud = async (cloudAccountId: string, localId: string) => {
    setBusy(true)
    setErrorMessage(null)
    setStatusMessage('Linking local session…')
    try {
      const full = await getFullAccount(localId)
      if (!full || !full.session_blob) {
        throw new Error('Selected profile has no valid session.')
      }
      await uploadCloudBlob(cloudAccountId, full.session_blob)
      setSyncTarget(null)
      setStatusMessage('Team account synced and ready to play!')
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleSyncActiveToCloud = async (cloudAccountId: string) => {
    setBusy(true)
    setErrorMessage(null)
    setStatusMessage('Uploading active login…')
    try {
      const activeSession = await captureActiveLocal()
      if (!activeSession) {
        throw new Error('No active Riot login found on this machine.')
      }
      await uploadCloudBlob(cloudAccountId, activeSession)
      setSyncTarget(null)
      setStatusMessage('Team account synced and ready to play!')
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    setErrorMessage(null)
    setStatusMessage(`Removing "${deleteTarget.name}"…`)
    try {
      if (deleteTarget.isCloud) {
        await deleteCloud(deleteTarget.id)
      } else {
        await deleteLocal(deleteTarget.id)
      }
      setStatusMessage(`Profile "${deleteTarget.name}" removed.`)
      setDeleteTarget(null)
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleResetRiot = async () => {
    if (!hasTauri) return
    setBusy(true)
    try {
      await invokeTauri('cleanup_account_session')
      setStatusMessage('Personal Riot settings restored.')
      setShowSettingsModal(false)
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const activeCloudAccount = useMemo(() => {
    return cloudAccounts.find((a) => a.id === cloudActiveAccountId)
  }, [cloudAccounts, cloudActiveAccountId])

  return (
    <div className="app-container">
      {/* Top Header */}
      <Header
        appMode={appMode}
        onModeChange={(mode) => {
          setAppMode(mode)
          setErrorMessage(null)
          setStatusMessage(null)
        }}
        user={user}
        onRefresh={() => {
          if (appMode === 'local') void reloadLocal()
          else void reloadCloud()
        }}
        onOpenSettings={() => setShowSettingsModal(true)}
      />

      {/* Sub Navigation Bar (Only if logged in for cloud, or in local mode) */}
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
          totalCount={appMode === 'local' ? filteredLocalAccounts.length : filteredCloudAccounts.length}
        />
      ) : null}

      {/* Main Viewport */}
      <main className="main-viewport">
        {/* PERSONAL ROSTER (LOCAL) */}
        {appMode === 'local' && (
          <div>
            {filteredLocalAccounts.length === 0 ? (
              <EmptyState
                searchActive={Boolean(searchQuery || selectedRegion !== 'ALL')}
                onAddAccount={() => setShowAddModal(true)}
              />
            ) : viewMode === 'grid' ? (
              <div className="roster-grid">
                {filteredLocalAccounts.map((acc) => (
                  <AccountCard
                    key={acc.id}
                    id={acc.id}
                    name={acc.name}
                    region={acc.region}
                    hasSession={acc.has_session}
                    lastUsedText={acc.last_used_at ? `Played ${new Date(acc.last_used_at).toLocaleDateString()}` : null}
                    canManage={true}
                    busy={busy}
                    onLaunch={() => void handleLaunchLocal(acc.id)}
                    onPushToCloud={user?.role === 'admin' ? () => void handlePushLocalToCloud(acc.id) : undefined}
                    onDelete={() => setDeleteTarget({ id: acc.id, name: acc.name, isCloud: false })}
                  />
                ))}
              </div>
            ) : (
              <AccountListTable
                items={filteredLocalAccounts.map((acc) => ({
                  id: acc.id,
                  name: acc.name,
                  region: acc.region,
                  hasSession: acc.has_session,
                  lastUsedText: acc.last_used_at ? new Date(acc.last_used_at).toLocaleDateString() : null,
                }))}
                canManage={true}
                busy={busy}
                onLaunch={(id) => void handleLaunchLocal(id)}
                onPushToCloud={user?.role === 'admin' ? (id) => void handlePushLocalToCloud(id) : undefined}
                onDelete={(id, name) => setDeleteTarget({ id, name, isCloud: false })}
              />
            )}
          </div>
        )}

        {/* TEAM VAULT (CLOUD) */}
        {appMode === 'cloud' && (
          <div>
            {!user ? (
              <LoginView
                onLogin={async (em, pw, rem) => {
                  await login(em, pw, rem)
                  await reloadCloud()
                }}
                busy={busy}
                error={authError}
              />
            ) : (
              <div>
                {/* Active Held Lease Banner */}
                {cloudSessionId && activeCloudAccount ? (
                  <div className="hextech-card" style={{ padding: '20px 24px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div className="card-avatar" style={{ width: '48px', height: '48px' }}>
                          <span className="avatar-initials">{activeCloudAccount.name.slice(0, 2).toUpperCase()}</span>
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 800 }}>
                              {activeCloudAccount.name}
                            </span>
                            <span className="avatar-region-pip" style={{ position: 'static' }}>
                              {activeCloudAccount.region}
                            </span>
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--teal-primary)', fontWeight: 600 }}>
                            ● Active Team Session Held
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn-launch-primary"
                          style={{ width: 'auto', padding: '0 20px' }}
                          onClick={() => void handleLaunchCloud(activeCloudAccount.id)}
                          disabled={busy}
                        >
                          <Play size={14} fill="currentColor" />
                          <span>Relaunch League</span>
                        </button>
                        <button
                          type="button"
                          className="btn-modal-secondary"
                          onClick={() => void releaseCloud()}
                          disabled={busy}
                        >
                          <Square size={13} />
                          <span>Release Account</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Team Accounts View */}
                {filteredCloudAccounts.length === 0 ? (
                  <EmptyState
                    isCloud={true}
                    searchActive={Boolean(searchQuery || selectedRegion !== 'ALL')}
                  />
                ) : viewMode === 'grid' ? (
                  <div className="roster-grid">
                    {filteredCloudAccounts.map((acc) => (
                      <AccountCard
                        key={acc.id}
                        id={acc.id}
                        name={acc.name}
                        region={acc.region}
                        hasSession={Boolean(acc.hasSessionBlob)}
                        isCloud={true}
                        canManage={user.role === 'admin'}
                        busy={busy}
                        onLaunch={() => void handleLaunchCloud(acc.id)}
                        onSync={() => setSyncTarget(acc)}
                        onDelete={() => setDeleteTarget({ id: acc.id, name: acc.name, isCloud: true })}
                      />
                    ))}
                  </div>
                ) : (
                  <AccountListTable
                    items={filteredCloudAccounts.map((acc) => ({
                      id: acc.id,
                      name: acc.name,
                      region: acc.region,
                      hasSession: Boolean(acc.hasSessionBlob),
                      lastUsedText: acc.lastUsed || null,
                    }))}
                    isCloud={true}
                    canManage={user.role === 'admin'}
                    busy={busy}
                    onLaunch={(id) => void handleLaunchCloud(id)}
                    onSync={(id) => {
                      const acc = filteredCloudAccounts.find((a) => a.id === id)
                      if (acc) setSyncTarget(acc)
                    }}
                    onDelete={(id, name) => setDeleteTarget({ id, name, isCloud: true })}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add Account Modal (Local) */}
      <AddAccountModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCaptureActive={handleCaptureLocal}
        onStartSandbox={async (name, reg) => {
          await startLocalSandbox()
        }}
        onCancelSandbox={async () => {
          await cancelLocalSandbox()
        }}
        provisioning={localProvisioning}
        busy={busy}
      />

      {/* Sync Account Modal (Cloud) */}
      <SyncAccountModal
        targetAccount={syncTarget}
        localAccounts={localAccounts}
        isOpen={Boolean(syncTarget)}
        onClose={() => setSyncTarget(null)}
        onLinkFromLocal={handleLinkLocalToCloud}
        onSyncActive={handleSyncActiveToCloud}
        onStartSandbox={async (accId) => {
          await startCloudSandbox()
        }}
        busy={busy}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        target={deleteTarget}
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        busy={busy}
      />

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

      {/* Global HUD Toast Notifications */}
      {statusMessage ? (
        <div className="hud-toast hud-toast-success">
          <CheckCircle2 size={16} />
          <span>{statusMessage}</span>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="hud-toast hud-toast-error">
          <X size={16} />
          <span>{errorMessage}</span>
        </div>
      ) : null}
    </div>
  )
}
