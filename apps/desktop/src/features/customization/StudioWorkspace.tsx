import { ClientStatusPage } from './ClientStatusPage'
import { DoctorPage } from './DoctorPage'
import { WorkspaceHome } from './WorkspaceHome'
import { Marketplace } from './Marketplace'
import { CreatorWorkshop } from './CreatorWorkshop'
import { PartyPage } from './PartyPage'
import { ThemePreview } from './ThemePreview'
import { ClientSurfaces } from './ClientSurfaces'
import { ModLibrary } from './ModLibrary'
import { useState } from 'react'
import { useI18n } from '../../context/I18nContext'
import { CatalogPage } from './CatalogPage'
import { PresetLibrary } from './PresetLibrary'
import type { Preset } from './api'
import '../../styles/customization.css'

export default function StudioWorkspace({
  profile,
  onSelectProfile,
  profiles = [],
}: {
  profile?: { id: string; name: string }
  onSelectProfile?: (next: { id: string; name: string } | undefined) => void
  profiles?: { id: string; name: string }[]
} = {}) {
  const { t } = useI18n()
  const [page, setPage] = useState<'catalog' | 'presets' | 'library' | 'themes' | 'surfaces' | 'party' | 'creator' | 'community' | 'home' | 'doctor' | 'client'>(profile ? 'presets' : 'home')
  const [selection, setSelection] = useState<Preset | null>(null)
  const [partySelection, setPartySelection] = useState<{ id: number; name: string } | null>(null)
  return (
    <div className="customization-workspace">
      <nav className="mode-nav" aria-label="Customization" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <button className="mode-pill" aria-pressed={page === 'home'} onClick={() => setPage('home')}>Overview</button>
        <button className="mode-pill" aria-pressed={page === 'catalog'} onClick={() => { setSelection(null); setPage('catalog') }}>{t('nav.catalog')}</button>
        <button className="mode-pill" aria-pressed={page === 'presets'} onClick={() => setPage('presets')}>{t('nav.presets')}</button>
        <button className="mode-pill" aria-pressed={page === 'library'} onClick={() => setPage('library')}>Mod library</button>
        <button className="mode-pill" aria-pressed={page === 'themes'} onClick={() => setPage('themes')}>{t('nav.themes')}</button>
        <button className="mode-pill" aria-pressed={page === 'surfaces'} onClick={() => setPage('surfaces')}>Client surfaces</button>
        <button className="mode-pill" aria-pressed={page === 'party'} onClick={() => setPage('party')}>{t('nav.party')}</button>
        <button className="mode-pill" aria-pressed={page === 'creator'} onClick={() => setPage('creator')}>{t('nav.workshop')}</button>
        <button className="mode-pill" aria-pressed={page === 'community'} onClick={() => setPage('community')}>{t('nav.marketplace')}</button>
        <button className="mode-pill" aria-pressed={page === 'doctor'} onClick={() => setPage('doctor')}>Health</button>
        <button className="mode-pill" aria-pressed={page === 'client'} onClick={() => setPage('client')}>Client</button>

        {profiles.length > 0 && onSelectProfile && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Preset Context:</span>
            <select
              aria-label="Preset context"
              style={{ padding: '4px 8px', fontSize: '0.8rem' }}
              value={profile?.id ?? ''}
              onChange={(e) => {
                const found = profiles.find((p) => p.id === e.target.value)
                onSelectProfile(found)
              }}
            >
              <option value="">All Profiles (Global)</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </nav>
      <section hidden={page !== 'party'}><PartyPage selection={partySelection} /></section>
      {page === 'home' ? <WorkspaceHome navigate={setPage} /> : page === 'catalog' ? <CatalogPage accountId={profile?.id} selection={selection} onShare={(skin) => { setPartySelection(skin); setPage('party') }} onSaved={() => setPage('presets')} />
        : page === 'client' ? <ClientStatusPage /> : page === 'doctor' ? <DoctorPage /> : page === 'library' ? <ModLibrary /> : page === 'themes' ? <ThemePreview /> : page === 'surfaces' ? <ClientSurfaces /> : page === 'community' ? <Marketplace /> : page === 'creator' ? <CreatorWorkshop /> : page === 'party' ? null : <PresetLibrary profile={profile} onOpen={(preset) => { setSelection(preset); setPage('catalog') }} />}
    </div>
  )
}
