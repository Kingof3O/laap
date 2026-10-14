import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { peekIcon, readIcon } from '../../lib/iconCache'
export function ProfileAvatar({
  name,
  asset,
  className = '',
}: {
  name: string
  asset?: string | null
  className?: string
}) {
  const [image, setImage] = useState<string | undefined>(() => peekIcon(asset))
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    setImage(peekIcon(asset))
    const refresh = async () => {
      if (!asset) {
        setFailed(false)
        return
      }
      setLoading(true)
      setFailed(false)
      try {
        const source = await readIcon(asset)
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
  }, [asset])
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
          alt={`${name.replace(/^★\s*/, '') || 'Account'} profile icon`}
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
          {name.replace(/^★\s*/, '').trim().slice(0, 2).toUpperCase() || '?'}
          {failed ? <small aria-hidden="true"> !</small> : null}
        </span>
      )}
    </span>
  )
}
