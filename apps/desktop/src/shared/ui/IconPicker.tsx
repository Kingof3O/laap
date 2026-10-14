import { useEffect, useRef, useState } from 'react'
import {
  ImagePlus,
  Search,
  Upload,
  Wifi,
  Trash2,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { invokeTauri } from '../../lib/api'
import {
  loadRiotIcon,
  rememberIcon,
  type CachedIcon,
  type IconCatalog,
} from '../../lib/iconCache'
import type { ProfileCustomization } from '../../lib/types'
function IconTile({
  id,
  label,
  version,
  online,
  selected,
  retry,
  onChoose,
}: {
  id: number
  label: string
  version: string
  online: boolean
  selected: boolean
  retry: number
  onChoose: (icon: CachedIcon, id: number) => void
}) {
  const [icon, setIcon] = useState<CachedIcon | null>(null),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '80px' },
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setError(false)
    setLoading(true)
    void loadRiotIcon(version, id, online)
      .then((icon) => {
        if (!cancelled) setIcon(icon)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [visible, version, id, online, retry])
  return (
    <button
      ref={ref}
      type="button"
      className={`icon-tile ${selected ? 'icon-tile-selected' : ''}`}
      aria-label={`Select ${label}`}
      aria-pressed={selected}
      disabled={!icon}
      title={error ? 'Image unavailable; retry online previews' : label}
      onClick={() => {
        if (icon) onChoose(icon, id)
      }}
    >
      {icon ? (
        <img
          src={icon.data_url}
          alt={label}
          loading="lazy"
          onError={() => {
            setIcon(null)
            setError(true)
          }}
        />
      ) : (
        <span>
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Loading…
            </>
          ) : error ? (
            'Failed · retry previews'
          ) : (
            `#${id} · not cached`
          )}
        </span>
      )}
      <small>#{id}</small>
    </button>
  )
}
export function IconPicker({
  value,
  onChange,
  disabled,
  onBusy,
}: {
  value: ProfileCustomization
  onChange: (value: ProfileCustomization) => void
  disabled: boolean
  onBusy: (busy: boolean) => void
}) {
  const [open, setOpen] = useState(false),
    [catalog, setCatalog] = useState<IconCatalog | null>(null),
    [online, setOnline] = useState(false),
    [query, setQuery] = useState(''),
    [limit, setLimit] = useState(48),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [uploading, setUploading] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void invokeTauri<IconCatalog | null>('get_icon_catalog', {
      downloadRequested: false,
    })
      .then((data) => {
        if (!cancelled) setCatalog(data)
      })
      .catch((cause) => {
        if (!cancelled) setError(String(cause))
      })
    return () => {
      cancelled = true
    }
  }, [open])
  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await invokeTauri<IconCatalog | null>('get_icon_catalog', {
        downloadRequested: true,
      })
      setCatalog(data)
      setOnline(true)
      setRetry((value) => value + 1)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setLoading(false)
    }
  }
  const upload = async (selected: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type)) {
      setError('Choose a PNG, JPEG, or WebP image.')
      return
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError('Choose an image smaller than 5 MB.')
      return
    }
    onBusy(true)
    setUploading(true)
    setError(null)
    try {
      const encoded = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.onerror = () => reject(new Error('Unable to read image'))
        reader.readAsDataURL(selected)
      })
      const icon = rememberIcon(
        await invokeTauri<CachedIcon>('upload_profile_icon', {
          base64Image: encoded,
        }),
      )
      onChange({
        ...value,
        icon_asset: icon.asset,
        icon_source: 'upload',
        icon_id: null,
        auto_sync_icon: false,
      })
    } catch (cause) {
      setError(String(cause))
    } finally {
      onBusy(false)
      setUploading(false)
    }
  }
  const matching =
    catalog?.icons.filter((icon) =>
      `${icon.label} ${icon.id}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? []
  return (
    <section className="profile-icon-settings" aria-label="Profile icon">
      <div className="profile-section-heading">
        <div>
          <h3>Profile icon</h3>
          <p>Yours on every launch. Saved on this device.</p>
        </div>
        <ImagePlus size={18} />
      </div>
      <div className="icon-actions">
        <button
          type="button"
          className="btn-modal-secondary"
          disabled={disabled}
          onClick={() => file.current?.click()}
        >
          {uploading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Upload size={14} />
          )}{' '}
          {uploading ? 'Saving image…' : 'Upload image'}
        </button>
        <button
          type="button"
          className="btn-modal-secondary"
          disabled={disabled}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <Search size={14} /> League icons
        </button>
        {value.icon_asset ? (
          <button
            type="button"
            className="icon-remove"
            aria-label="Remove profile icon"
            disabled={disabled}
            onClick={() =>
              onChange({
                ...value,
                icon_asset: null,
                icon_id: null,
                icon_source: null,
                auto_sync_icon: false,
              })
            }
          >
            <Trash2 size={15} />
          </button>
        ) : null}
      </div>
      <input
        ref={file}
        className="visually-hidden"
        tabIndex={-1}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Upload profile image"
        disabled={disabled}
        onChange={(event) => {
          const selected = event.target.files?.[0]
          if (selected) void upload(selected)
          event.target.value = ''
        }}
      />
      {open ? (
        <div className="icon-browser">
          <div className="icon-browser-heading">
            <strong>League profile icons</strong>
            <button
              type="button"
              aria-label="Close icon picker"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <p className="picker-hint">
            Catalog and previews download only when you choose. Icons you view
            are cached for offline use. Search by icon ID.
          </p>
          <div className="icon-browser-toolbar">
            <input
              aria-label="Search League icons"
              className="hextech-input"
              placeholder="Search icon ID…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setLimit(48)
              }}
            />
            {catalog && online ? (
              <button
                type="button"
                className="btn-modal-secondary"
                disabled={disabled || loading}
                onClick={() => setRetry((value) => value + 1)}
              >
                <RefreshCw size={13} /> Retry previews
              </button>
            ) : null}
            {catalog && !online ? (
              <button
                type="button"
                className="btn-modal-secondary"
                disabled={disabled || loading}
                onClick={() => setOnline(true)}
              >
                <Wifi size={13} /> Load online previews
              </button>
            ) : null}
            <button
              type="button"
              className="btn-modal-secondary"
              disabled={disabled || loading}
              onClick={() => void refresh()}
            >
              {loading ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Downloading
                  catalog…
                </>
              ) : catalog ? (
                'Refresh catalog'
              ) : (
                'Download catalog & previews'
              )}
            </button>
          </div>
          {catalog ? (
            <>
              <div className="icon-grid">
                {matching.slice(0, limit).map((icon) => (
                  <IconTile
                    key={`${catalog.version}-${icon.id}`}
                    {...icon}
                    version={catalog.version}
                    online={online}
                    retry={retry}
                    selected={value.icon_id === icon.id}
                    onChoose={(icon, id) =>
                      onChange({
                        ...value,
                        icon_asset: icon.asset,
                        icon_id: id,
                        icon_source: 'riot',
                        auto_sync_icon: false,
                      })
                    }
                  />
                ))}
              </div>
              {!matching.length ? (
                <p className="picker-hint">No matching icon IDs.</p>
              ) : null}
              <div className="icon-browser-footer">
                <span>
                  {Math.min(limit, matching.length)} of {matching.length} · Data
                  Dragon {catalog.version}
                </span>
                {matching.length > limit ? (
                  <button
                    type="button"
                    className="btn-modal-secondary"
                    onClick={() => setLimit(limit + 48)}
                  >
                    Load more
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <p className="picker-hint">
              No catalog saved yet. Upload a local image, or download Riot’s
              catalog when connected.
            </p>
          )}
        </div>
      ) : null}
      {error ? (
        <p className="profile-form-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
