import { useEffect, useState } from 'react'
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
  useEffect(() => {
    let cancelled = false
    setImage(peekIcon(asset))
    if (asset)
      void readIcon(asset)
        .then((source) => {
          if (!cancelled) setImage(source)
        })
        .catch(() => {
          if (!cancelled) setImage(undefined)
        })
    const refresh = () => {
      if (asset)
        void readIcon(asset)
          .then((source) => {
            if (!cancelled) setImage(source)
          })
          .catch(() => {})
    }
    window.addEventListener('laap:icons-updated', refresh)
    return () => {
      cancelled = true
      window.removeEventListener('laap:icons-updated', refresh)
    }
  }, [asset])
  return (
    <span className={`profile-avatar-image ${className}`}>
      {image ? (
        <img
          src={image}
          alt={`${name.replace(/^★\s*/, '') || 'Account'} profile icon`}
          onError={() => setImage(undefined)}
          draggable={false}
        />
      ) : (
        <span aria-label="Account initials">
          {name.replace(/^★\s*/, '').trim().slice(0, 2).toUpperCase() || '?'}
        </span>
      )}
    </span>
  )
}
