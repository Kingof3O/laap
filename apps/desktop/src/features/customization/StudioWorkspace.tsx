import { ClientStatusPage } from './ClientStatusPage'
import { DoctorPage } from './DoctorPage'
import { WorkspaceHome } from './WorkspaceHome'
import { Marketplace } from './Marketplace'
import { CreatorWorkshop } from './CreatorWorkshop'
import { PartyPage } from './PartyPage'
import { ThemePreview } from './ThemePreview'
import { ModLibrary } from './ModLibrary'
import { useState } from 'react'
import { CatalogPage } from './CatalogPage'
import { PresetLibrary } from './PresetLibrary'
import type { Preset } from './api'
import '../../styles/customization.css'

export default function StudioWorkspace({ profile }: { profile?: { id: string; name: string } } = {}) {
  const [page, setPage] = useState<'catalog' | 'presets' | 'library' | 'themes' | 'party' | 'creator' | 'community' | 'home' | 'doctor' | 'client'>(profile ? 'presets' : 'home')
  const [selection, setSelection] = useState<Preset | null>(null)
  const [partySelection, setPartySelection] = useState<{ id: number; name: string } | null>(null)
  return (
    <div className="customization-workspace">
      <nav className="mode-nav" aria-label="Customization">
        <button className="mode-pill" aria-pressed={page === 'home'} onClick={() => setPage('home')}>Overview</button>
        <button className="mode-pill" aria-pressed={page === 'catalog'} onClick={() => { setSelection(null); setPage('catalog') }}>Catalog</button>
        <button className="mode-pill" aria-pressed={page === 'presets'} onClick={() => setPage('presets')}>Presets</button>
        <button className="mode-pill" aria-pressed={page === 'library'} onClick={() => setPage('library')}>Mod library</button>
        <button className="mode-pill" aria-pressed={page === 'themes'} onClick={() => setPage('themes')}>Themes</button>
        <button className="mode-pill" aria-pressed={page === 'party'} onClick={() => setPage('party')}>Party</button>
        <button className="mode-pill" aria-pressed={page === 'creator'} onClick={() => setPage('creator')}>Creator</button>
        <button className="mode-pill" aria-pressed={page === 'community'} onClick={() => setPage('community')}>Community</button>
        <button className="mode-pill" aria-pressed={page === 'doctor'} onClick={() => setPage('doctor')}>Health</button>
        <button className="mode-pill" aria-pressed={page === 'client'} onClick={() => setPage('client')}>Client</button>
      </nav>
      <section hidden={page !== 'party'}><PartyPage selection={partySelection} /></section>
      {page === 'home' ? <WorkspaceHome navigate={setPage} /> : page === 'catalog' ? <CatalogPage accountId={profile?.id} selection={selection} onShare={(skin) => { setPartySelection(skin); setPage('party') }} onSaved={() => setPage('presets')} />
        : page === 'client' ? <ClientStatusPage /> : page === 'doctor' ? <DoctorPage /> : page === 'library' ? <ModLibrary /> : page === 'themes' ? <ThemePreview /> : page === 'community' ? <Marketplace /> : page === 'creator' ? <CreatorWorkshop /> : page === 'party' ? null : <PresetLibrary profile={profile} onOpen={(preset) => { setSelection(preset); setPage('catalog') }} />}
    </div>
  )
}
