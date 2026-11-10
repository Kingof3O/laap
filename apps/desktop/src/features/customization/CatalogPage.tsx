import { isTauriAvailable } from '../../lib/api'
import { useEffect, useRef, useState } from 'react'
import { catalog, errorMessage, type Champion, type ChampionDetail, type Preset, type Snapshot, type CatalogChange, type CatalogPreferences } from './api'
import { PresetEditor } from './PresetLibrary'

const CDN = 'https://ddragon.leagueoflegends.com/cdn'
const PAGE_SIZE = 40

const catalogChecks = new Map<string, number>()

function CatalogArtwork({ id, version, skin, name, thumbnail = false }: { id: string; version: string; skin?: number; name: string; thumbnail?: boolean }) {
  const [failed, setFailed] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const [visible, setVisible] = useState(!thumbnail)
  const holder = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (visible || !holder.current) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '160px' })
    observer.observe(holder.current)
    return () => observer.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let current = true
    if (isTauriAvailable()) {
      void catalog.artwork(id, version, skin).then((url) => {
        if (current) {
          if (typeof url === 'string' && url.startsWith('data:image/')) setImage(url)
          else setFailed(true)
        }
      }).catch(() => { if (current) setFailed(true) })
    } else {
      setImage(skin === undefined ? CDN + '/' + version + '/img/champion/' + id + '.png'
        : CDN + '/img/champion/loading/' + id + '_' + skin + '.jpg')
    }
    return () => { current = false }
  }, [visible, id, version, skin])

  return <span ref={holder} className={thumbnail ? 'catalog-artwork-thumb' : 'catalog-artwork-preview'}>
    {image && !failed ? <img src={image} alt={thumbnail ? '' : name + ' cosmetic preview'} onError={() => setFailed(true)} />
      : thumbnail ? <span className="catalog-thumbnail-fallback" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>
      : <span className="catalog-preview-fallback">{failed ? 'Preview unavailable from the provider' : 'Loading preview…'}</span>}
  </span>
}

export function CatalogPage({ accountId, selection, onSaved, onShare }: { accountId?: string; selection: Preset | null; onSaved: () => void; onShare: (skin: { id: number; name: string }) => void }) {
  const [locale, setLocale] = useState('en_US')
  const [snapshot, setSnapshot] = useState<Snapshot<Champion[]> | null>(null)
  const [detail, setDetail] = useState<Snapshot<ChampionDetail> | null>(null)
  const [selected, setSelected] = useState(selection?.championId ?? '')
  const [skinId, setSkinId] = useState(selection?.skinId ?? '')
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [revision, setRevision] = useState(0)
  const [retry, setRetry] = useState(0)
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Preset | null>(null)

  const [prefs, setPrefs] = useState<CatalogPreferences>({ favorites: [], recent: [] })
  const [prefsError, setPrefsError] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [prefsBusy, setPrefsBusy] = useState(false)

  useEffect(() => {
    let current = true
    void catalog.preferences().then((data) => {
      if (current && data) setPrefs(data)
    }).catch((cause: unknown) => { if (current) setPrefsError(errorMessage(cause)) })
    return () => { current = false }
  }, [])

  async function updatePreferences(change: CatalogChange) {
    setPrefsError('')
    setPrefsBusy(true)
    try {
      setPrefs(await catalog.preferences(change))
    } catch (cause) {
      setPrefsError(errorMessage(cause))
    } finally {
      setPrefsBusy(false)
    }
  }

  useEffect(() => {
    let current = true
    void catalog.list(locale, revision > 0).then((data) => {
      if (!current) return
      setSnapshot(data)
      if (data.cached && revision === 0 && Date.now() - (catalogChecks.get(locale) ?? 0) > 15 * 60_000) {
        catalogChecks.set(locale, Date.now())
        void catalog.list(locale, true).then((latest) => {
          if (current && !latest.cached) setSnapshot(latest)
        }).catch(() => { /* Keep the working offline snapshot. */ })
      }
    }).catch((cause: unknown) => {
      if (current) setError(errorMessage(cause))
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [locale, revision])

  useEffect(() => {
    if (!selected || !snapshot) return
    let current = true
    void catalog.detail(selected, snapshot).then((data) => {
      if (current) {
        setDetail(data)
        setSkinId((id) => data.data.skins.some((skin) => skin.id === id) ? id : (data.data.skins[0]?.id ?? ''))
      }
    }).catch((cause: unknown) => {
      if (current) setDetailError(errorMessage(cause))
    })
    return () => { current = false }
  }, [selected, snapshot, retry])

  const term = query.trim().toLocaleLowerCase()
  const champions = (snapshot?.data ?? []).filter((row) =>
    (!role || row.tags.includes(role)) && (!term || row.name.toLocaleLowerCase().includes(term)) &&
    (!favoritesOnly || prefs.favorites.includes(row.id)),
  ).sort((a, b) => a.name.localeCompare(b.name))

  function openChampion(id: string, reference = '') {
    setSelected(id)
    setSkinId(reference)
    setDetail(null)
    setDetailError('')
    setDraft(null)
  }

  function refresh(nextLocale = locale) {
    setLocale(nextLocale)
    setError('')
    setLoading(true)
    setRevision((value) => value + 1)
  }

  const skin = detail?.data.skins.find((entry) => entry.id === skinId)
  return (
    <>
      <div className="customization-heading">
        <div><h2>Champion catalog</h2><p>Explore Riot Data Dragon cosmetics and save local references.</p></div>
        <button className="btn-secondary" disabled={loading} onClick={() => refresh()}>{loading ? 'Loading…' : 'Refresh catalog'}</button>
      </div>
      {snapshot && <p className="customization-source">Riot Data Dragon · {snapshot.version} · {snapshot.locale}{snapshot.bundled ? ' · Included with the app' : snapshot.cached ? ' · Cached copy' : ' · Current data'}</p>}
      {error && <p role="alert">{error}</p>}
      {prefsError && <p role="alert">{prefsError}</p>}
      {selected ? (
        <section>
          <button className="btn-secondary" onClick={() => openChampion('')}>Back to catalog</button>
          {detailError && <p role="alert">{detailError} <button className="btn-secondary" onClick={() => { setDetailError(''); setRetry((i) => i + 1) }}>Retry</button></p>}
          {!detail && !detailError && !error && <p role="status">Loading champion…</p>}
          {detail && (
            <div className="customization-detail">
              {skin && <CatalogArtwork key={detail.version + skin.id} id={detail.data.id} version={detail.version} skin={skin.num} name={detail.data.name} />}
              <div>
                <h3>{detail.data.name}</h3><p>{detail.data.lore}</p>
                <button className="btn-secondary" aria-pressed={prefs.favorites.includes(detail.data.id)} disabled={prefsBusy}
                  onClick={() => void updatePreferences({ action: 'favorite', id: detail.data.id, enabled: !prefs.favorites.includes(detail.data.id) })}>
                  {prefs.favorites.includes(detail.data.id) ? 'Remove favorite' : 'Favorite champion'}
                </button>
                <label>Skin <select value={skinId} onChange={(event) => { setSkinId(event.target.value); setDraft(null)
                  void updatePreferences({ action: 'remember', selection: { championId: detail.data.id, skinId: event.target.value } })
                }} disabled={prefsBusy}>
                  {detail.data.skins.map((entry) => <option key={entry.id} value={entry.id}>{entry.num === 0 ? 'Default' : entry.name}</option>)}
                </select></label>
                <p className="customization-source">Ownership unknown.{skin?.chromas ? ' Riot lists chromas for this skin.' : ''} Previews do not equip cosmetics.</p>
                {skin && !draft && <button className="btn-primary" onClick={() => setDraft({ id: null, name: skin.num ? skin.name : detail.data.name, championId: detail.data.id, skinId: skin.id, accountId: accountId ?? null })}>Create preset</button>}
                {skin && <button className="btn-secondary" onClick={() => onShare({ id: Number(skin.id), name: skin.num ? skin.name : detail.data.name })}>Open in party</button>}
                {draft && <PresetEditor draft={draft} onSaved={onSaved} onCancel={() => setDraft(null)} />}
              </div>
            </div>
          )}
        </section>
      ) : (
        <>
          <div className="customization-filters">
            <label>Search champions <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setVisible(PAGE_SIZE) }} /></label>
            <label>Role <select value={role} onChange={(event) => { setRole(event.target.value); setVisible(PAGE_SIZE) }}>
              <option value="">All roles</option>{['Assassin', 'Fighter', 'Mage', 'Marksman', 'Support', 'Tank'].map((value) => <option key={value}>{value}</option>)}
            </select></label>
            <label>Catalog language <select value={locale} disabled={loading} onChange={(event) => refresh(event.target.value)}>
              <option value="en_US">English</option><option value="de_DE">Deutsch</option><option value="ar_AE">العربية</option>
            </select></label>
          </div>
          <div className="customization-actions">
            <button className="btn-secondary" aria-pressed={favoritesOnly} onClick={() => { setFavoritesOnly((value) => !value); setVisible(PAGE_SIZE) }}>Favorites only</button>
            {champions.length > 0 && <button className="btn-secondary" onClick={() => {
              const candidate = champions[Math.floor(Math.random() * champions.length)]
              if (candidate) openChampion(candidate.id)
            }}>Random champion</button>}
          </div>
          {snapshot && prefs.recent.length > 0 && <details className="customization-recent">
            <summary>Recent selections</summary>
            <div className="customization-actions">
              {prefs.recent.filter((item) => snapshot.data.some((row) => row.id === item.championId)).map((item) =>
                <button key={item.championId + item.skinId} className="btn-secondary" onClick={() => openChampion(item.championId, item.skinId)}>{snapshot.data.find((row) => row.id === item.championId)?.name} · #{item.skinId}</button>)}
              <button className="btn-secondary" disabled={prefsBusy} onClick={() => void updatePreferences({ action: 'clearHistory' })}>Clear history</button>
            </div>
          </details>}
          {snapshot && !champions.length && <p>No champions match your filters.</p>}
          <div className="customization-grid">
            {champions.slice(0, visible).map((champion) => (
              <button className="customization-card" key={champion.id} onClick={() => openChampion(champion.id)}>
                <CatalogArtwork key={snapshot?.version} thumbnail id={champion.id} version={snapshot!.version} name={champion.name} />
                <strong>{champion.name}</strong><span>{champion.tags.join(' · ')}</span>
              </button>
            ))}
          </div>
          {champions.length > visible && <button className="btn-secondary" onClick={() => setVisible((n) => n + PAGE_SIZE)}>Show more champions</button>}
        </>
      )}
      <small className="customization-source">LAAP is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.</small>
    </>
  )
}
