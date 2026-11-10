import { ExternalLink, ShieldCheck } from 'lucide-react'
import { IS_OFFLINE_ONLY, openExternalUrl } from '../../../lib/api'
import { GITHUB_REPO } from '../../../hooks/useUpdateChecker'

export function AboutSettings({ currentVersion }: { currentVersion: string }) {
  const repo = `https://github.com/${GITHUB_REPO}`
  return <div className="settings-section about-page" aria-label="About LAAP">
    <div className="about-brand"><img src="/logo.webp" alt="LAAP" /><div><h3>LAAP Desktop</h3><p>{IS_OFFLINE_ONLY ? 'Offline Edition' : 'Team Edition'} · v{currentVersion}</p></div></div>
    <p className="about-description">Manage saved Riot sessions and launch accounts from one desktop workspace.</p>
    <div className="about-facts"><div><span>Runtime</span><strong>Tauri 2 · Rust · React</strong></div><div><span>Local storage</span><strong><ShieldCheck size={15} /> Encrypted vault</strong></div></div>
    <div className="about-links"><button type="button" className="btn-secondary" onClick={() => void openExternalUrl(repo)}>GitHub repository <ExternalLink size={14}/></button><button type="button" className="btn-secondary" onClick={() => void openExternalUrl(`${repo}/releases`)}>Release notes <ExternalLink size={14}/></button></div>
    <p className="about-disclaimer">LAAP is not endorsed, affiliated with, or certified by Riot Games. League of Legends, Valorant and Riot Games are trademarks of Riot Games, Inc.</p>
  </div>
}
