import type { ReactNode } from 'react'
import { Clock3, FileText, Settings2, ShieldCheck, X } from 'lucide-react'
import type { RosterItem } from './AccountRosterDisplay'

export function ProfileInspector({ account, busy, onClose, onEdit, actions }: { account: RosterItem; busy: boolean; onClose: () => void; onEdit?: () => void; actions?: ReactNode }) {
  const added = account.createdAt && Number.isFinite(Date.parse(account.createdAt)) ? new Date(account.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : null
  return <aside id="profile-inspector" className="profile-inspector" aria-label="Selected profile details">
    <div className="inspector-top"><div><span className="inspector-eyebrow">SELECTED ACCOUNT</span><h2>Account details</h2></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Hide account details"><X size={18}/></button></div>
    <div className="inspector-profile"><div className="inspector-symbol" aria-hidden="true"><ShieldCheck size={22}/></div><div><strong title={account.name}>{account.name}</strong><span className="inspector-subtitle">{account.region}{account.rank ? ` · ${account.rank}` : ''}</span></div></div>
    <dl className="inspector-details">
      <div><dt><ShieldCheck size={15}/> Session</dt><dd>{account.status || (account.hasSession ? 'Login saved' : 'Sign in required')}</dd></div>
      <div><dt><Clock3 size={15}/> Last played</dt><dd>{account.lastUsedText || 'Never played'}</dd></div>
      {added ? <div><dt><Clock3 size={15}/> Profile added</dt><dd>{added}</dd></div> : null}
    </dl>
    {account.notes !== undefined ? <div className="inspector-notes"><span className="inspector-label"><FileText size={14}/> Notes</span><p>{account.notes || 'No notes added.'}</p></div> : null}
    {onEdit ? <button className="inspector-edit" type="button" onClick={onEdit} disabled={busy}><Settings2 size={15}/> Manage profile <span aria-hidden="true">↗</span></button> : null}
    {actions}
  </aside>
}
