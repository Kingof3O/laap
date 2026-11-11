import { useEffect, useRef, useState } from 'react'
import { invokeTauri } from '../../lib/api'
import { errorMessage } from './api'
import { catalogOrigin } from './communityEndpoint'
import { readFileBase64 } from './packageFiles'

interface MarketplaceMod {
  id?: string
  packageHash: string
  title: string
  description?: string
  champion?: string
  version: string
  creatorName?: string
  averageRating?: number
  downloadCount?: number
  reviewCount?: number
  tags?: string[]
  bytes?: number
  author?: string
  license?: string
  displayName?: string
}

interface ReviewItem {
  id: string
  author: string
  rating: number
  comment: string
  createdAt: number
}

const validHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

export function Marketplace() {
  const [modsList, setModsList] = useState<MarketplaceMod[] | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [working, setWorking] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  // Report modal
  const [reporting, setReporting] = useState<string | null>(null)
  const [reason, setReason] = useState('broken')
  const [notes, setNotes] = useState('')

  // Reviews modal
  const [viewingReviews, setViewingReviews] = useState<string | null>(null)
  const [reviewsList, setReviewsList] = useState<ReviewItem[]>([])
  const [newRating, setNewRating] = useState(5)
  const [newComment, setNewComment] = useState('')
  const [reviewAuthor, setReviewAuthor] = useState('')

  // Submit mod modal
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [subCreatorId, setSubCreatorId] = useState('creator_' + Math.random().toString(36).slice(2, 8))
  const [subHash, setSubHash] = useState('')
  const [subTitle, setSubTitle] = useState('')
  const [subDesc, setSubDesc] = useState('')
  const [subChamp, setSubChamp] = useState('')
  const [subTags, setSubTags] = useState('VFX, Audio')
  const [subConfirmed, setSubConfirmed] = useState(false)

  const active = useRef<AbortController | null>(null)

  useEffect(() => () => active.current?.abort(), [])

  async function load() {
    if (!catalogOrigin) return
    setWorking(true)
    setError('')
    try {
      // Try rich marketplace endpoint first
      let res = await fetch(catalogOrigin + '/v1/marketplace/mods', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json() as MarketplaceMod[]
        setModsList(data)
      } else {
        // Fallback to basic approved catalog
        res = await fetch(catalogOrigin + '/v1/catalog/mods', { cache: 'no-store' })
        if (res.ok) {
          const basic = await res.json() as Array<{ hash: string; displayName: string; author: string; version: string; bytes: number }>
          setModsList(basic.map((b) => ({
            packageHash: b.hash,
            title: b.displayName,
            version: b.version,
            creatorName: b.author,
            bytes: b.bytes,
            averageRating: 5.0,
            downloadCount: 1,
            reviewCount: 0,
            tags: [],
          })))
        }
      }
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setWorking(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function add(hash: string) {
    if (!validHash(hash) || !catalogOrigin) return
    setWorking(true)
    setError('')
    try {
      const base = '/v1/catalog/mods/' + hash
      const res = await fetch(catalogOrigin + base, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to retrieve package manifest.')
      const manifest = await res.json() as { sha256?: string; rightToDistribute?: boolean; containsPaidRiotContent?: boolean }

      const dlRes = await fetch(catalogOrigin + base + '/download')
      if (!dlRes.ok) throw new Error('Failed to download package archive.')
      const bytes = await dlRes.blob()
      const archive = await readFileBase64(new File([bytes], hash + '.zip'))

      await invokeTauri('mod_import', { archive, manifest, rightsConfirmed: true })

      // Record download metric
      void fetch(catalogOrigin + '/v1/marketplace/download/' + hash, { method: 'POST' }).catch(() => {})

      setSelected(null)
      setStatus('Package verified and added to your mod library.')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setWorking(false)
    }
  }

  async function submitReport() {
    if (!reporting || !validHash(reporting) || !catalogOrigin) return
    setWorking(true)
    try {
      const res = await fetch(catalogOrigin + '/v1/catalog/mods/' + reporting + '/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, notes }),
      })
      if (!res.ok) throw new Error('Report request failed.')
      setReporting(null)
      setNotes('')
      setStatus('Report submitted to moderation queue.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setWorking(false)
    }
  }

  async function openReviews(hash: string) {
    if (!catalogOrigin) return
    setViewingReviews(hash)
    setReviewsList([])
    try {
      const res = await fetch(catalogOrigin + '/v1/marketplace/reviews/' + hash)
      if (res.ok) {
        setReviewsList(await res.json() as ReviewItem[])
      }
    } catch {
      // Ignored
    }
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault()
    if (!viewingReviews || !catalogOrigin) return
    setWorking(true)
    try {
      const res = await fetch(catalogOrigin + '/v1/marketplace/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageHash: viewingReviews,
          author: reviewAuthor.trim() || 'Community Member',
          rating: newRating,
          comment: newComment.trim(),
        }),
      })
      if (!res.ok) throw new Error('Failed to submit review.')
      setNewComment('')
      await openReviews(viewingReviews)
      await load()
      setStatus('Review submitted successfully.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setWorking(false)
    }
  }

  async function submitMod(e: React.FormEvent) {
    e.preventDefault()
    if (!catalogOrigin || !subConfirmed || !validHash(subHash)) return
    setWorking(true)
    try {
      const res = await fetch(catalogOrigin + '/v1/marketplace/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorId: subCreatorId,
          packageHash: subHash,
          title: subTitle.trim(),
          description: subDesc.trim(),
          champion: subChamp.trim(),
          version: '1.0.0',
          tags: subTags.split(',').map((t) => t.trim()).filter(Boolean),
          rightsConfirmed: true,
        }),
      })
      if (!res.ok) throw new Error('Package submission rejected.')
      setShowSubmitModal(false)
      setSubHash('')
      setSubTitle('')
      setSubDesc('')
      setSubChamp('')
      setSubConfirmed(false)
      await load()
      setStatus('Package published to community catalog.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <div className="customization-heading">
        <div>
          <h2>Community marketplace</h2>
          <p>Browse, review, and discover community-published custom skins and overlays.</p>
        </div>
        <div className="customization-actions">
          <button className="btn-primary" onClick={() => setShowSubmitModal(true)}>+ Publish mod</button>
          <button className="btn-secondary" disabled={working} onClick={() => void load()}>{working ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>

      {!catalogOrigin && <p role="status">This build has no configured community catalog.</p>}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}

      {/* Publish Mod Modal */}
      {showSubmitModal && (
        <form className="customization-editor" style={{ marginBottom: '1.5rem' }} onSubmit={(e) => void submitMod(e)}>
          <h3>Publish mod to marketplace</h3>
          <label>Package SHA-256 hash <input required pattern="[a-f0-9]{64}" placeholder="64-character hex hash" value={subHash} onChange={(e) => setSubHash(e.target.value.toLowerCase().trim())} /></label>
          <label>Mod title <input required placeholder="e.g. Cyberpunk Ahri" value={subTitle} onChange={(e) => setSubTitle(e.target.value)} /></label>
          <label>Champion <input required placeholder="e.g. Ahri" value={subChamp} onChange={(e) => setSubChamp(e.target.value)} /></label>
          <label>Tags (comma separated) <input placeholder="Sci-Fi, VFX, Audio" value={subTags} onChange={(e) => setSubTags(e.target.value)} /></label>
          <label>Description <textarea rows={2} value={subDesc} onChange={(e) => setSubDesc(e.target.value)} /></label>
          <label className="customization-check">
            <input type="checkbox" required checked={subConfirmed} onChange={(e) => setSubConfirmed(e.target.checked)} />
            I have permission to distribute these assets and confirm this mod contains no paid Riot content or executables.
          </label>
          <div className="customization-actions">
            <button type="submit" className="btn-primary" disabled={working || !subConfirmed || !validHash(subHash)}>Submit package</button>
            <button type="button" className="btn-secondary" onClick={() => setShowSubmitModal(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* Reviews Modal */}
      {viewingReviews && (
        <section className="customization-editor" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Community reviews ({reviewsList.length})</h3>
            <button className="btn-secondary" onClick={() => setViewingReviews(null)}>Close</button>
          </div>

          <form onSubmit={(e) => void submitReview(e)} style={{ margin: '1rem 0' }}>
            <h4>Write a review</h4>
            <div style={{ display: 'flex', gap: '8px' }}>
              <label style={{ flex: 1 }}>Your name <input placeholder="Player name" value={reviewAuthor} onChange={(e) => setReviewAuthor(e.target.value)} /></label>
              <label style={{ width: '120px' }}>Rating
                <select value={newRating} onChange={(e) => setNewRating(Number(e.target.value))}>
                  <option value={5}>★★★★★ (5)</option>
                  <option value={4}>★★★★☆ (4)</option>
                  <option value={3}>★★★☆☆ (3)</option>
                  <option value={2}>★★☆☆☆ (2)</option>
                  <option value={1}>★☆☆☆☆ (1)</option>
                </select>
              </label>
            </div>
            <label>Review comment <textarea rows={2} required maxLength={500} placeholder="Share feedback on texture quality, in-game look, or bugs…" value={newComment} onChange={(e) => setNewComment(e.target.value)} /></label>
            <button type="submit" className="btn-primary" disabled={working || !newComment.trim()}>Post review</button>
          </form>

          <ul style={{ paddingLeft: 0, listStyle: 'none' }}>
            {reviewsList.map((r) => (
              <li key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{r.author}</strong>
                  <span style={{ color: '#f59e0b' }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                </div>
                <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>{r.comment}</p>
              </li>
            ))}
            {reviewsList.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No reviews yet. Be the first to review this mod!</p>}
          </ul>
        </section>
      )}

      {/* Report Modal */}
      {reporting && (
        <form className="customization-editor" style={{ marginBottom: '1.5rem' }} onSubmit={(event) => { event.preventDefault(); void submitReport() }}>
          <h3>Report package issue</h3>
          <label>Reason <select value={reason} onChange={(event) => setReason(event.target.value)}>
            <option value="broken">Broken package</option>
            <option value="copyright">Rights concern</option>
            <option value="malware">Unsafe content</option>
            <option value="other">Other</option>
          </select></label>
          <label>Details <textarea maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <div className="customization-actions">
            <button className="btn-primary" disabled={working}>Submit report</button>
            <button type="button" className="btn-secondary" disabled={working} onClick={() => setReporting(null)}>Cancel</button>
          </div>
        </form>
      )}

      {/* Catalog List */}
      {!modsList && !error && <p role="status">Loading marketplace catalog…</p>}
      {modsList?.length === 0 && <p>No packages found in the community catalog.</p>}

      <ul className="customization-list">
        {modsList?.map((item) => (
          <li key={item.packageHash}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{item.title} · v{item.version}</strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {item.averageRating !== undefined && (
                  <span style={{ color: '#f59e0b', fontSize: '0.85rem' }}>★ {item.averageRating.toFixed(1)} ({item.reviewCount ?? 0})</span>
                )}
                {item.downloadCount !== undefined && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>⬇ {item.downloadCount}</span>
                )}
              </div>
            </div>
            <span>By {item.creatorName || item.author || 'Community Creator'}{item.champion ? ` · Champion: ${item.champion}` : ''}</span>
            {item.description && <p style={{ fontSize: '0.85rem', margin: '4px 0', color: 'var(--text-muted)' }}>{item.description}</p>}

            {item.tags && item.tags.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', margin: '4px 0' }}>
                {item.tags.map((t) => (
                  <span key={t} className="badge" style={{ fontSize: '0.7rem', padding: '1px 6px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px' }}>{t}</span>
                ))}
              </div>
            )}

            <div className="customization-actions" style={{ marginTop: '0.5rem' }}>
              <button className="btn-secondary" onClick={() => void openReviews(item.packageHash)}>Reviews ({item.reviewCount ?? 0})</button>
              <button className="btn-secondary" disabled={working} onClick={() => { setReporting(item.packageHash); setNotes('') }}>Report</button>
              {selected === item.packageHash ? <>
                <button className="btn-primary" disabled={working} onClick={() => void add(item.packageHash)}>Download & verify</button>
                <button className="btn-secondary" disabled={working} onClick={() => setSelected(null)}>Back</button>
              </> : <button className="btn-primary" disabled={working} onClick={() => setSelected(item.packageHash)}>Get package</button>}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
