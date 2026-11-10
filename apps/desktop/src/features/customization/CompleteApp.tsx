import { lazy, Suspense, useState } from 'react'
import App from '../../App'

const StudioWorkspace = lazy(() => import('./StudioWorkspace'))

export default function CompleteApp() {
  const [studio, setStudio] = useState(false)
  const [profile, setProfile] = useState<{ id: string; name: string } | undefined>()
  return <App
    onShowAccounts={() => setStudio(false)}
    profileActions={(account) => <button className="inspector-edit" type="button" onClick={() => {
      setProfile({ id: account.id, name: account.name })
      setStudio(true)
    }}>Customization presets</button>}
    navigation={<nav className="mode-nav" aria-label="Workspace">
      <button className="mode-pill" aria-pressed={!studio} onClick={() => setStudio(false)}>Accounts</button>
      <button className="mode-pill" aria-pressed={studio} onClick={() => { setProfile(undefined); setStudio(true) }}>Studio</button>
    </nav>}
    studio={studio ? <Suspense fallback={<p role="status">Opening Studio…</p>}><StudioWorkspace key={profile?.id ?? 'studio'} profile={profile} /></Suspense> : undefined}
  />
}
