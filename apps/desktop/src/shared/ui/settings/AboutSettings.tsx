import { useState } from 'react'
import { Copy, ExternalLink, FileText, ShieldCheck } from 'lucide-react'
import { product } from '../../../product/flavors'
import { openExternalUrl } from '../../../lib/api'

function releaseLink(value?: string) {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port) return value.trim()
  } catch {
    // Only publish configured HTTPS links.
  }
  return null
}

const helpLinks = [
  { label: 'Support', url: releaseLink(import.meta.env.VITE_LAAP_SUPPORT_URL) },
  { label: 'Privacy policy', url: releaseLink(import.meta.env.VITE_LAAP_PRIVACY_URL) },
  { label: 'Terms', url: releaseLink(import.meta.env.VITE_LAAP_TERMS_URL) },
]
const releaseNotesUrl = releaseLink(import.meta.env.VITE_LAAP_RELEASE_NOTES_URL)

export function AboutSettings({
  currentVersion,
  edition = product.name,
  onOpenPrivacy,
  onOpenRelease,
}: {
  currentVersion: string
  edition?: string
  onOpenPrivacy: () => void
  onOpenRelease?: () => void
}) {
  const [copyMessage, setCopyMessage] = useState('')
  const appInfo = `${edition} · v${currentVersion}`

  const copyAppInfo = async () => {
    try {
      await navigator.clipboard.writeText(appInfo)
      setCopyMessage('Edition and version copied.')
    } catch {
      setCopyMessage('Select the edition and version above to copy them manually.')
    }
  }

  return (
    <div className="settings-section about-page" aria-label="About LAAP">
      <div className="settings-section-header">
        <h3 className="settings-section-title">Help &amp; About</h3>
        <p className="settings-section-desc">Product information and release resources.</p>
      </div>
      <div className="about-brand">
        <img src="/logo.webp" alt="LAAP" />
        <div><h4>LAAP Desktop</h4><p>{appInfo}</p></div>
        <button type="button" className="btn-secondary about-copy-icon" aria-label="Copy edition and version"
          title="Copy edition and version" onClick={() => void copyAppInfo()}>
          <Copy size={16} aria-hidden="true" />
        </button>
      </div>
      {copyMessage ? <p className="settings-section-desc" role="status">{copyMessage}</p> : null}
      <div className="about-links">
        {releaseNotesUrl || onOpenRelease ? <button type="button" className="btn-secondary"
          onClick={() => releaseNotesUrl ? void openExternalUrl(releaseNotesUrl) : onOpenRelease?.()}>
          <FileText size={15} aria-hidden="true" /> What’s new
        </button> : null}
        <button type="button" className="btn-secondary" onClick={onOpenPrivacy}>
          <ShieldCheck size={15} aria-hidden="true" /> Privacy &amp; Vault
        </button>
        {helpLinks.map(({ label, url }) => url ? (
          <button key={label} type="button" className="btn-secondary" onClick={() => void openExternalUrl(url)}>
            {label} <ExternalLink size={14} aria-hidden="true" />
          </button>
        ) : null)}
      </div>
      <details className="settings-card settings-info-card settings-notices">
        <summary>Third-party notices</summary>
        <p>League of Legends, VALORANT, and Riot Games are trademarks of Riot Games, Inc.</p>
      </details>
      <p className="about-disclaimer">LAAP is not endorsed, affiliated with, or certified by Riot Games.</p>
    </div>
  )
}
