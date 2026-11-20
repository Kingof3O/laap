import { useEffect, useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { peekIcon, readIcon } from '../../lib/iconCache'
import { getOpggCachedAvatar } from '../../lib/opgg'
import type { Game } from '../../lib/types'

export function ProfileAvatar({
  name,
  asset,
  activeGame,
  avatarUrl,
  riotId,
  region,
  className = '',
}: {
  name: string
  asset?: string | null
  activeGame?: Game
  avatarUrl?: string | null
  riotId?: string | null
  region?: string
  className?: string
}) {
  const resolveEffectiveAsset = useCallback(() => {
    if (avatarUrl) return avatarUrl
    if (activeGame === 'valorant') {
      const cached = getOpggCachedAvatar(riotId || name, region || 'euw', 'valorant')
      if (cached) return cached
      if (asset && !asset.startsWith('dd-')) return asset
      return undefined
    }
    return asset
  }, [avatarUrl, activeGame, riotId, name, region, asset])

  const [effectiveAsset, setEffectiveAsset] = useState<string | null | undefined>(resolveEffectiveAsset)
  const [image, setImage] = useState<string | undefined>(() => peekIcon(resolveEffectiveAsset()))
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const current = resolveEffectiveAsset()
    setEffectiveAsset(current)
    setImage(peekIcon(current))

    const refresh = async () => {
      const target = resolveEffectiveAsset()
      setEffectiveAsset(target)
      if (!target) {
        setFailed(false)
        setImage(undefined)
        return
      }
      setLoading(true)
      setFailed(false)
      try {
        const source = await readIcon(target)
        if (!cancelled) {
          setImage(source)
          setFailed(!source)
        }
      } catch {
        if (!cancelled) {
          setImage(undefined)
          setFailed(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void refresh()
    window.addEventListener('laap:icons-updated', refresh)
    return () => {
      cancelled = true
      window.removeEventListener('laap:icons-updated', refresh)
    }
  }, [resolveEffectiveAsset])

  if (activeGame === 'valorant' && !effectiveAsset && !image) {
    return (
      <span className={`profile-avatar-image ${className}`}>
        <img
          src="/valorant-icon.webp"
          alt={`${name || 'Account'} VALORANT profile icon`}
          draggable={false}
        />
      </span>
    )
  }
  return (
    <span
      className={`profile-avatar-image ${className}`}
      aria-busy={loading}
      title={
        failed
          ? 'Icon unavailable. Retry sync or choose the icon again in Edit Profile.'
          : undefined
      }
    >
      {image ? (
        <img
          src={image}
          alt={`${name || 'Account'} profile icon`}
          onError={() => {
            setImage(undefined)
            setFailed(true)
          }}
          draggable={false}
        />
      ) : loading ? (
        <Loader2
          size={16}
          className="animate-spin"
          aria-label="Loading profile icon"
        />
      ) : (
        <span
          aria-label={
            failed
              ? 'Icon unavailable; showing account initials'
              : 'Account initials'
          }
        >
          {name.trim().slice(0, 2).toUpperCase() || '?'}
          {failed ? <small aria-hidden="true"> !</small> : null}
        </span>
      )}
    </span>
  )
}
