import { useEffect, useState } from 'react'
import { ClipboardList, FileClock } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { GlassCard } from '../components/GlassCard'

type AuditEntry = { id: string; action: string; entityType: string; entityId: string; payload: Record<string, unknown>; createdAt: string; actor: string }
type AuditLogPageProps = { offline: boolean; onToast: (message: string) => void }

export function AuditLogPage({ offline, onToast }: AuditLogPageProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const refresh = async () => { if (offline) return; try { setEntries((await api.getAudit()).audit) } catch (error) { onToast(error instanceof ApiError ? error.message : 'Unable to load audit log') } }
  useEffect(() => { void refresh() }, [offline])
  return <div className="mx-auto max-w-[1600px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10"><p className="eyebrow">Trust / Audit log</p><h1 className="display-title mt-3">A complete trail of change.</h1><p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">Trace leases, assignments, and security events with accountable timestamps.</p><GlassCard className="mt-7 overflow-hidden"><div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-5 sm:px-6"><span className="section-icon section-icon-amber"><ClipboardList aria-hidden="true" size={16} /></span><div><h2 className="section-title">Audit events <span className="font-mono text-[11px] text-slate-600">{entries.length}</span></h2><p className="mt-1 text-xs text-slate-500">Immutable server-side activity records</p></div></div><div className="divide-y divide-white/[0.05]">{entries.map((entry) => <div key={entry.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6"><div className="grid h-9 w-9 place-items-center rounded-xl border border-amber-300/15 bg-amber-300/10 text-amber-200"><FileClock aria-hidden="true" size={16} /></div><div className="min-w-[190px] flex-1"><p className="font-mono text-xs font-medium text-slate-200">{entry.action}</p><p className="mt-1 text-[11px] text-slate-500">{entry.actor} · {entry.entityType}</p></div><span className="font-mono text-[10px] text-slate-600">{new Date(entry.createdAt).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>)}{!entries.length ? <p className="px-6 py-10 text-center text-xs text-slate-500">Audit events become available after the API connects.</p> : null}</div></GlassCard></div>
}
