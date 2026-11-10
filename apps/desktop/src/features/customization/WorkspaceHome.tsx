import { useEffect, useState } from 'react'
import { catalog, errorMessage, presets, type Champion, type Snapshot } from './api'
import { invokeTauri } from '../../lib/api'
import { catalogOrigin } from './communityEndpoint'

type WorkspacePage = 'catalog' | 'presets' | 'library' | 'themes' | 'party' | 'creator' | 'community'
type Count = { value?: number; error?: string }
type Counts = { champions: Count; presets: Count; packages: Count }
const INITIAL: Counts = { champions: {}, presets: {}, packages: {} }

export function WorkspaceHome({ navigate }: { navigate: (page: WorkspacePage) => void }) {
  const [counts, setCounts] = useState<Counts>(INITIAL)
  const [source, setSource] = useState<Snapshot<Champion[]> | null>(null)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let current = true
    setLoading(true)
    const capture = (key: keyof Counts, task: Promise<unknown[]>) =>
      task.then((rows) => { if (current) setCounts((state) => ({ ...state, [key]: { value: rows.length } })) })
        .catch((cause: unknown) => { if (current) setCounts((state) => ({ ...state, [key]: { error: errorMessage(cause) } })) })
    void Promise.all([
      capture('champions', catalog.list('en_US', revision > 0).then((snapshot) => {
        if (current) setSource(snapshot)
        return snapshot.data
      })),
      capture('presets', presets.list()),
      capture('packages', invokeTauri<unknown[]>('mod_list')),
    ]).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [revision])

  const quantity = (key: keyof Counts) => counts[key].error ? 'Needs attention' : counts[key].value === undefined ? 'Loading…' : counts[key].value?.toLocaleString()
  return (
    <>
      <div className="customization-heading">
        <div><span className="inspector-eyebrow">YOUR CREATIVE WORKSPACE</span><h2>Everything starts here</h2>
          <p>Browse cosmetics, build your own content, and keep your setup on this device.</p></div>
        <button className="btn-secondary" disabled={loading} onClick={() => setRevision((value) => value + 1)}>{loading ? 'Checking…' : 'Refresh workspace'}</button>
      </div>
      <div className="studio-overview-grid">
        <button className="studio-overview-card" onClick={() => navigate('catalog')}><span>CHAMPION CATALOG</span><strong>{quantity('champions')}</strong><p>{source ? 'Patch ' + source.version + (source.bundled ? ' · Included with the app' : source.cached ? ' · Saved on this device' : ' · Current data') : 'Versioned Riot Data Dragon metadata'}</p><span>Browse champions →</span></button>
        <button className="studio-overview-card" onClick={() => navigate('presets')}><span>SAVED PRESETS</span><strong>{quantity('presets')}</strong><p>Your cosmetic references and preferences.</p><span>Open presets →</span></button>
        <button className="studio-overview-card" onClick={() => navigate('library')}><span>LOCAL PACKAGES</span><strong>{quantity('packages')}</strong><p>Validated, rights-cleared content stored locally.</p><span>Manage library →</span></button>
      </div>
      {Object.entries(counts).filter(([, count]) => count.error).map(([name, count]) => <p role="alert" key={name}>{name}: {count.error}</p>)}
      <h3>Explore your workspace</h3>
      <div className="studio-feature-grid">
        <button className="studio-feature-card" onClick={() => navigate('creator')}><strong>Creator workshop</strong><p>Build checksummed packages from your original images.</p></button>
        <button className="studio-feature-card" onClick={() => navigate('themes')}><strong>Theme workshop</strong><p>Preview and save colors and typography locally.</p></button>
        <button className="studio-feature-card" onClick={() => navigate('party')}><strong>Party rooms</strong><p>{catalogOrigin ? 'Create or join a room with your permission.' : 'Review connection options and service availability.'}</p></button>
        <button className="studio-feature-card" onClick={() => navigate('community')}><strong>Community catalog</strong><p>{catalogOrigin ? 'Discover packages approved by the service operator.' : 'Review approved-package download capabilities.'}</p></button>
      </div>
    </>
  )
}
