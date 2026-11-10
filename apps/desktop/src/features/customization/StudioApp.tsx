import { StudioSettings } from './StudioSettings'
import { useState } from 'react'
import { WindowTitleBar } from '../../shared/ui/WindowTitleBar'
import { Header } from '../../shared/ui/Header'
import { UpdateModal } from '../../shared/ui/UpdateModal'
import { useUpdateChecker } from '../../hooks/useUpdateChecker'
import StudioWorkspace from './StudioWorkspace'

export default function StudioApp() {
  const update = useUpdateChecker()
  const [settings, setSettings] = useState(false)
  const [release, setRelease] = useState(false)
  return (
    <div className="app-container studio-active">
      <WindowTitleBar>
        <Header onOpenSettings={() => setSettings((open) => !open)} updateAvailable={update.updateAvailable} onOpenUpdates={() => setRelease(true)} />
      </WindowTitleBar>
      <main className="main-viewport">
        {settings ? <StudioSettings update={update} onOpenRelease={() => setRelease(true)} onClose={() => setSettings(false)} /> : <StudioWorkspace />}
      </main>
      <UpdateModal
        isOpen={release || update.updateAvailable}
        currentVersion={update.currentVersion}
        release={update.latestRelease}
        status={update.status}
        downloadProgress={update.downloadProgress}
        installError={update.installError}
        onDownload={update.openReleasePage}
        onInstall={update.downloadAndInstallUpdate}
        onDismiss={(forever) => { update.dismissUpdate(forever); setRelease(false) }}
      />
    </div>
  )
}
