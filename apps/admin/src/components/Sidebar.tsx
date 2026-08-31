import type { LucideIcon } from 'lucide-react'
import { Activity, ChevronDown, CircleHelp, LogOut, ShieldCheck, X } from 'lucide-react'
import type { PageName } from '../lib/data'
import type { ApiUser } from '@laap/types'

export type NavItem = { label: PageName; icon: LucideIcon; badge?: string }

type SidebarProps = {
  items: NavItem[]
  activePage: PageName
  onNavigate: (page: PageName) => void
  mobileOpen: boolean
  onClose: () => void
  currentUser?: ApiUser
  onLogout?: () => void
}

export function Sidebar({ items, activePage, onNavigate, mobileOpen, onClose, currentUser, onLogout }: SidebarProps) {
  return (
    <>
      <div aria-hidden="true" onClick={onClose} className={`fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm transition-opacity lg:hidden ${mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />
      <aside className={`sidebar fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-white/[0.07] bg-sidebar px-4 pb-5 pt-5 backdrop-blur-2xl transition-transform duration-300 lg:static lg:translate-x-0 lg:bg-transparent lg:backdrop-blur-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`} aria-label="Primary navigation">
        <div className="flex items-center justify-between px-3">
          <button type="button" onClick={() => onNavigate('Overview')} className="group flex cursor-pointer items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80" aria-label="Go to overview">
            <span className="brand-mark"><ShieldCheck aria-hidden="true" size={18} strokeWidth={2.2} /></span>
            <span>
              <span className="block font-mono text-[15px] font-semibold tracking-[0.12em] text-slate-100">LAAP</span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.17em] text-slate-500">Control center</span>
            </span>
          </button>
          <button type="button" onClick={onClose} className="icon-button lg:hidden" aria-label="Close navigation"><X aria-hidden="true" size={18} /></button>
        </div>

        <div className="mt-8 px-3"><p className="eyebrow">Workspace</p></div>
        <nav className="mt-3 flex-1" aria-label="Workspace sections">
          <ul className="space-y-1">
            {items.slice(0, 1).map((item) => <NavLink key={item.label} item={item} active={activePage === item.label} onNavigate={onNavigate} />)}
          </ul>
          <p className="mt-7 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">Manage</p>
          <ul className="mt-3 space-y-1">
            {items.slice(1, 4).map((item) => <NavLink key={item.label} item={item} active={activePage === item.label} onNavigate={onNavigate} />)}
          </ul>
          <p className="mt-7 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">Trust & security</p>
          <ul className="mt-3 space-y-1">
            {items.slice(4).map((item) => <NavLink key={item.label} item={item} active={activePage === item.label} onNavigate={onNavigate} />)}
          </ul>
        </nav>

        <div className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.045] p-3.5">
          <div className="flex items-center gap-2"><span className="live-dot" aria-hidden="true" /><span className="text-xs font-medium text-emerald-300">All systems operational</span></div>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">Supabase realtime synced <span className="font-mono text-slate-400">2s ago</span></p>
        </div>
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
          <div className="avatar avatar-indigo">AK</div>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-slate-200">{currentUser?.displayName ?? 'Alex Kim'}</p><p className="truncate text-[11px] text-slate-500">{currentUser?.role === 'operator' ? 'Operator' : 'Administrator'}</p></div>
          <button type="button" className="icon-button h-8 w-8" aria-label="Open account menu"><ChevronDown aria-hidden="true" size={15} /></button>
        </div>
        <div className="mt-4 flex items-center justify-between px-2 text-[11px] text-slate-600"><button type="button" className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 transition hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80" aria-label="Open help center"><CircleHelp aria-hidden="true" size={13} />Help center</button>{onLogout ? <button type="button" onClick={onLogout} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 transition hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80" aria-label="Sign out"><LogOut aria-hidden="true" size={13} />Sign out</button> : <LogOut aria-hidden="true" size={13} />}</div>
      </aside>
    </>
  )
}

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: (page: PageName) => void }) {
  const Icon = item.icon
  return <li><button type="button" onClick={() => onNavigate(item.label)} aria-current={active ? 'page' : undefined} className={`nav-link ${active ? 'nav-link-active' : ''}`}><Icon aria-hidden="true" size={17} strokeWidth={active ? 2.2 : 1.8} /><span>{item.label}</span>{item.badge ? <span className="ml-auto rounded-full bg-cyan-300/10 px-2 py-0.5 font-mono text-[10px] text-cyan-200">{item.badge}</span> : null}</button></li>
}
