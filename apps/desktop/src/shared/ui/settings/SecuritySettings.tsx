import { useRef, useState } from 'react'
import { Download, Eye, EyeOff, Globe, ShieldCheck, Upload, Volume2, VolumeX } from 'lucide-react'
import { invokeTauri } from '../../../lib/api.ts'
import { isStreamerModeEnabled, setStreamerMode } from '../../../lib/streamerMode.ts'
import { isSoundEnabled, setSoundEnabled, playHextechSelect } from '../../../lib/soundEffects.ts'

export function SecuritySettings() {
  const [streamer, setStreamer] = useState(isStreamerModeEnabled())
  const [sound, setSound] = useState(isSoundEnabled())
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleToggleStreamer = () => {
    const next = !streamer
    setStreamerMode(next)
    setStreamer(next)
    playHextechSelect()
  }

  const handleToggleSound = () => {
    const next = !sound
    setSoundEnabled(next)
    setSound(next)
    if (next) playHextechSelect()
  }

  const handleExportVault = async () => {
    setExporting(true)
    setBackupMessage(null)
    try {
      const accounts = await invokeTauri<unknown[]>('list_local_accounts')
      const exportData = {
        app: 'LAAP',
        version: '1.0.2',
        exportedAt: new Date().toISOString(),
        accounts,
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `laap-vault-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setBackupMessage('Vault backup exported successfully.')
    } catch (cause) {
      setBackupMessage(`Export failed: ${String(cause)}`)
    } finally {
      setExporting(false)
    }
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setBackupMessage(null)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data || !Array.isArray(data.accounts)) {
        throw new Error('Invalid LAAP backup file format.')
      }
      setBackupMessage(`Backup contains ${data.accounts.length} profiles. Ready for restore.`)
      window.dispatchEvent(new Event('laap:refresh'))
    } catch (cause) {
      setBackupMessage(`Import failed: ${String(cause)}`)
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="settings-section" aria-label="Privacy and vault settings">
      <div className="settings-section-header">
        <h3 className="settings-section-title">Privacy &amp; Vault</h3>
        <p className="settings-section-desc">Manage local encryption, streamer protections, and vault backups.</p>
      </div>

      {/* Streamer Mode & Audio Quick Controls */}
      <div className="settings-card settings-toggles-card">
        <div className="settings-toggle-row">
          <div className="settings-toggle-copy">
            <div className="settings-toggle-title">
              {streamer ? <EyeOff size={16} /> : <Eye size={16} />}
              <span>Streamer Mode (Privacy Shield)</span>
            </div>
            <p className="settings-toggle-desc">
              Masks Riot IDs, account names, and personal notes across all cards and inspectors to prevent stream sniping.
            </p>
          </div>
          <button
            type="button"
            className={`btn-secondary ${streamer ? 'btn-active' : ''}`}
            onClick={handleToggleStreamer}
          >
            {streamer ? 'Active' : 'Disabled'}
          </button>
        </div>

        <div className="settings-toggle-row" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="settings-toggle-copy">
            <div className="settings-toggle-title">
              {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
              <span>Hextech Tactile Audio</span>
            </div>
            <p className="settings-toggle-desc">
              Native zero-latency synthesizer sounds for card selection, game switching, and session launch.
            </p>
          </div>
          <button
            type="button"
            className={`btn-secondary ${sound ? 'btn-active' : ''}`}
            onClick={handleToggleSound}
          >
            {sound ? 'Sound On' : 'Muted'}
          </button>
        </div>
      </div>

      {/* Encrypted Vault Backup & Migration */}
      <div className="settings-card settings-info-card">
        <div className="settings-card-heading">
          <ShieldCheck size={17} aria-hidden="true" />
          <h4>Vault Backup &amp; Migration</h4>
        </div>
        <p>Export your saved accounts to an encrypted file to transfer to another PC or restore after Windows reinstallation.</p>
        
        <div className="settings-backup-actions" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExportVault}
            disabled={exporting}
          >
            <Download size={14} /> Export Vault Backup
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <Upload size={14} /> Restore from File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
        </div>
        {backupMessage ? (
          <p className="settings-backup-feedback" style={{ marginTop: '8px', fontSize: '0.82rem', color: '#a855f7' }}>
            {backupMessage}
          </p>
        ) : null}
      </div>

      {/* Online services */}
      <div className="settings-card settings-info-card">
        <div className="settings-card-heading">
          <Globe size={17} aria-hidden="true" />
          <h4>Online services</h4>
        </div>
        <ul className="settings-service-list">
          <li><strong>OP.GG</strong> uses the profile’s Riot ID and region where applicable to retrieve public stats. Linked profiles can refresh in the background.</li>
          <li><strong>Billing</strong> connects online for sign-in, payments, and license verification. An active offline license is valid for the period shown under License &amp; Billing.</li>
          <li><strong>Updates</strong> connect online to check for and download updates. You can change the automatic check preference under Updates.</li>
        </ul>
      </div>
    </div>
  )
}
