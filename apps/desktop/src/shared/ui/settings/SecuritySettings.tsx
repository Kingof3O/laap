import { Database, Globe, ShieldCheck } from 'lucide-react'
import { flavor, product } from '../../../product/flavors'

export function SecuritySettings() {
  return (
    <div className="settings-section" aria-label="Privacy and vault settings">
      <div className="settings-section-header">
        <h3 className="settings-section-title">Privacy &amp; Vault</h3>
        <p className="settings-section-desc">See what LAAP stores on this computer and when it connects online.</p>
      </div>
      {product.accounts ? (
        <div className="settings-card settings-info-card">
          <div className="settings-card-heading"><ShieldCheck size={17} aria-hidden="true" /><h4>Saved Riot logins</h4></div>
          <p>Saved Riot session data is encrypted with AES-GCM. Profile names and notes are readable local data.</p>
        </div>
      ) : null}
      {product.studio ? (
        <div className="settings-card settings-info-card">
          <div className="settings-card-heading"><Database size={17} aria-hidden="true" /><h4>Studio data</h4></div>
          <p>Presets and creator files are stored locally. Community and client integrations have separate controls.</p>
        </div>
      ) : null}
      <div className="settings-card settings-info-card">
        <div className="settings-card-heading"><Globe size={17} aria-hidden="true" /><h4>Online services</h4></div>
        <ul className="settings-service-list">
          {product.accounts ? <li><strong>OP.GG</strong> uses the profile’s Riot ID and region where applicable to retrieve public stats. Linked profiles can refresh in the background.</li> : null}
          {flavor === 'basic' ? <li><strong>Billing</strong> connects online for sign-in, payments, and license verification. An active offline license is valid for the period shown under License &amp; Billing.</li> : null}
          <li><strong>Updates</strong> connect online to check for and download updates. You can change the automatic check preference under Updates.</li>
          {product.studio ? <li><strong>Studio integrations</strong> connect to community services or enabled providers when used.</li> : null}
        </ul>
      </div>
    </div>
  )
}
