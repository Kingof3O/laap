import { isTauriAvailable } from '../../lib/api'
import { useEffect, useRef, useState } from 'react'
import { catalog, errorMessage, type Champion, type ChampionDetail, type Preset, type Snapshot, type CatalogChange, type CatalogPreferences, type TftItem, type Chroma, type Variant } from './api'
import { PresetEditor } from './PresetLibrary'

const CDN = 'https://ddragon.leagueoflegends.com/cdn'
const PAGE_SIZE = 40

const CATALOG_LOCALES = [
  { code: 'en_US', name: 'English (US)' },
  { code: 'en_GB', name: 'English (UK)' },
  { code: 'de_DE', name: 'Deutsch' },
  { code: 'es_ES', name: 'Español (España)' },
  { code: 'es_MX', name: 'Español (Latinoamérica)' },
  { code: 'fr_FR', name: 'Français' },
  { code: 'it_IT', name: 'Italiano' },
  { code: 'ja_JP', name: '日本語' },
  { code: 'ko_KR', name: '한국어' },
  { code: 'pl_PL', name: 'Polski' },
  { code: 'pt_BR', name: 'Português (Brasil)' },
  { code: 'ru_RU', name: 'Русский' },
  { code: 'tr_TR', name: 'Türkçe' },
  { code: 'zh_CN', name: '简体中文' },
  { code: 'zh_TW', name: '繁體中文' },
  { code: 'th_TH', name: 'ไทย' },
  { code: 'vi_VN', name: 'Tiếng Việt' },
  { code: 'id_ID', name: 'Bahasa Indonesia' },
  { code: 'ms_MY', name: 'Bahasa Melayu' },
  { code: 'el_GR', name: 'Ελληνικά' },
  { code: 'cs_CZ', name: 'Čeština' },
  { code: 'hu_HU', name: 'Magyar' },
  { code: 'ro_RO', name: 'Română' },
  { code: 'ar_AE', name: 'العربية (RTL)' },
]

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
  const [tab, setTab] = useState<'champions' | 'tft'>('champions')
  const [tftItems, setTftItems] = useState<TftItem[] | null>(null)
  const [tftCategory, setTftCategory] = useState('all')
  const [selectedChroma, setSelectedChroma] = useState<string | null>(selection?.chromaId ?? null)
  const [selectedVariant, setSelectedVariant] = useState<string | null>(selection?.variantId ?? null)

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

  useEffect(() => {
    if (tab === 'tft' && !tftItems) {
      void catalog.tftList().then(setTftItems).catch(e => setError(errorMessage(e)))
    }
  }, [tab, tftItems])

  useEffect(() => {
    if (locale === 'ar_AE') {
      document.documentElement.setAttribute('dir', 'rtl')
    } else {
      document.documentElement.setAttribute('dir', 'ltr')
    }
    return () => {
      document.documentElement.setAttribute('dir', 'ltr')
    }
  }, [locale])

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
        setSelectedChroma(null)
        setSelectedVariant(null)
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

  function openChampion(id: string, reference = '', chroma?: string, variant?: string) {
    setSelected(id)
    setSkinId(reference)
    setSelectedChroma(chroma ?? null)
    setSelectedVariant(variant ?? null)
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

  async function triggerRandomPick() {
    try {
      const pick = await catalog.randomPick(favoritesOnly)
      openChampion(pick.championId, pick.skinId)
    } catch (e) { setError(errorMessage(e))
    }
  }

  const skin = detail?.data.skins.find((entry) => entry.id === skinId)
  const filteredTft = tftItems?.filter((item) => tftCategory === 'all' || item.category === tftCategory)

  return (
    <>
      <div className="customization-heading">
        <div>
          <h2>Content catalog</h2>
          <p>Explore patch-aware League of Legends champions, skins, chromas, and TFT tacticians.</p>
        </div>
        <div className="customization-actions">
          <button className={tab === 'champions' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('champions')}>Champions & Skins</button>
          <button className={tab === 'tft' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('tft')}>TFT Tacticians & Arenas</button>
          <button className="btn-secondary" disabled={loading} onClick={() => refresh()}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>

      {snapshot && tab === 'champions' && (
        <p className="customization-source">Riot Data Dragon · {snapshot.version} · {snapshot.locale}{snapshot.bundled ? ' · Included with the app' : snapshot.cached ? ' · Cached copy' : ' · Current data'}</p>
      )}
      {error && <p role="alert">{error}</p>}
      {prefsError && <p role="alert">{prefsError}</p>}

      {tab === 'tft' ? (
        <section>
          <div className="customization-filters">
            <label>Category <select value={tftCategory} onChange={(e) => setTftCategory(e.target.value)}>
              <option value="all">All TFT Items</option>
              <option value="Tactician">Tacticians / Little Legends</option>
              <option value="Arena">Arenas</option>
              <option value="Boom">Booms</option>
            </select></label>
          </div>
          {!tftItems ? <p role="status">Loading TFT items…</p> : tftItems.length === 0 ? (
            <p role="status">No TFT items available offline. Connect to the internet to load the live CommunityDragon TFT cosmetics catalog.</p>
          ) : (
            <div className="customization-grid">
              {filteredTft?.map((item) => (
                <div key={item.category+item.id} className="customization-card" style={{ cursor: 'default' }}>
                  <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="badge" style={{ fontSize: '0.75rem', padding: '2px 6px', background: 'var(--accent, #6366f1)', borderRadius: '4px' }}>{item.category}</span>
                      <span style={{ fontSize: '0.8rem', color: '#f59e0b' }}>{item.tier !== null ? '★'.repeat(Math.min(5,item.tier)) : 'Tier not provided'}</span>
                    </div>
                    <strong style={{ display: 'block', marginTop: '0.5rem' }}>{item.name}</strong>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)', marginTop: '0.25rem' }}>{item.description}</p>
                    <button className="btn-secondary" style={{ marginTop: '0.5rem', width: '100%' }} onClick={() => setDraft({
                      id: null,
                      name: item.name,
                      championId: 'TFT' + item.category,
                      skinId: item.id,
                      queueMode: 'tft',
                      accountId: accountId ?? null,
                    })}>Save TFT Preset</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {draft && <PresetEditor draft={draft} onSaved={onSaved} onCancel={() => setDraft(null)} />}
        </section>
      ) : selected ? (
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
                <label>Skin <select value={skinId} onChange={(event) => {
                  setSkinId(event.target.value)
                  setSelectedChroma(null)
                  setSelectedVariant(null)
                  setDraft(null)
                  void updatePreferences({ action: 'remember', selection: { championId: detail.data.id, skinId: event.target.value } })
                }} disabled={prefsBusy}>
                  {detail.data.skins.map((entry) => <option key={entry.id} value={entry.id}>{entry.num === 0 ? 'Default' : entry.name}</option>)}
                </select></label>

                {skin?.variants && skin.variants.length > 0 && (
                  <label>Alternate Form
                    <select value={selectedVariant ?? ''} onChange={(e) => setSelectedVariant(e.target.value || null)}>
                      <option value="">Standard Form</option>
                      {skin.variants.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.description})</option>)}
                    </select>
                  </label>
                )}

                {skin?.availableChromas && skin.availableChromas.length > 0 ? (
                  <div style={{ margin: '0.75rem 0' }}>
                    <label>Chromas ({skin.availableChromas.length} variants available)</label>
                    <div className="customization-actions" style={{ flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                      <button type="button" className={!selectedChroma ? 'btn-primary' : 'btn-secondary'} onClick={() => setSelectedChroma(null)}>Base Skin</button>
                      {skin.availableChromas.map((c) => (
                        <button key={c.id} type="button" className={selectedChroma === c.id ? 'btn-primary' : 'btn-secondary'} onClick={() => setSelectedChroma(c.id)}>
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : skin?.chromas ? (
                  <p className="customization-source" style={{ margin: '0.5rem 0' }}>
                    Riot lists chromas for this skin. Live authentic chromas are loaded when connected to CommunityDragon.
                  </p>
                ) : null}

                {detail.data.skins.length > 1 && (
                  <button className="btn-secondary" type="button" disabled={prefsBusy} onClick={() => {
                    const choices = detail.data.skins
                    const pick = choices[Math.floor(Math.random() * choices.length)]
                    if (pick) {
                      setSkinId(pick.id)
                      setSelectedChroma(null)
                      setSelectedVariant(null)
                      setDraft(null)
                      void updatePreferences({ action: 'remember', selection: { championId: detail.data.id, skinId: pick.id } })
                    }
                  }}>Random skin</button>
                )}
                <p className="customization-source">Ownership unknown.{skin?.chromas ? ' Riot lists chromas for this skin.' : ''} Previews do not equip cosmetics.</p>
                {skin && !draft && <button className="btn-primary" onClick={() => setDraft({
                  id: null,
                  name: (skin.num ? skin.name : detail.data.name) + (selectedChroma ? ' (Chroma)' : '') + (selectedVariant ? ' [' + selectedVariant + ']' : ''),
                  championId: detail.data.id,
                  skinId: skin.id,
                  chromaId: selectedChroma,
                  variantId: selectedVariant,
                  accountId: accountId ?? null,
                })}>Create preset</button>}
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
              {CATALOG_LOCALES.map((item) => (
                <option key={item.code} value={item.code}>{item.name}</option>
              ))}
            </select></label>
          </div>
          <div className="customization-actions">
            <button className="btn-secondary" aria-pressed={favoritesOnly} onClick={() => { setFavoritesOnly((value) => !value); setVisible(PAGE_SIZE) }}>Favorites only</button>
            <button className="btn-secondary" onClick={() => void triggerRandomPick()}>Random champion</button>
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
