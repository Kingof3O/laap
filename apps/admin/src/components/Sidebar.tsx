import type { LucideIcon } from 'lucide-react'
import { LogOut, ShieldCheck, X } from 'lucide-react'
import type { PageName } from '../lib/data'
import type { ApiUser } from '@laap/types'
import { initials, navigationLabel, roleLabel } from '../lib/labels'

export type NavItem = { label: PageName; icon: LucideIcon; badge?: string }

type SidebarProps = {
  items: NavItem[]
  activePage: PageName
  onNavigate: (page: PageName) => void
  mobileOpen: boolean
  onClose: () => void
  currentUser?: ApiUser
  onLogout?: () => void
  isAdmin?: boolean
}

export function Sidebar({ items, activePage, onNavigate, mobileOpen, onClose, currentUser, onLogout, isAdmin = false }: SidebarProps) {
  return (
    <>
      <div aria-hidden="true" onClick={onClose} className={`fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm transition-opacity lg:hidden ${mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />
      <aside className={`sidebar fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-white/[0.07] bg-sidebar px-4 pb-5 pt-5 backdrop-blur-2xl transition-transform duration-300 lg:h-dvh lg:max-h-dvh lg:overflow-y-auto lg:translate-x-0 lg:bg-transparent lg:backdrop-blur-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`} aria-label="Primary navigation">
        <div className="flex items-center justify-between px-3">
          <button type="button" onClick={() => onNavigate('Overview')} className="group flex cursor-pointer items-center rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/80" aria-label="Go to overview">
            <img src="/logo.webp" alt="LAAP" className="h-7 w-auto object-contain" />
          </button>
          <button type="button" onClick={onClose} className="icon-button lg:hidden" aria-label="Close navigation"><X aria-hidden="true" size={18} /></button>
        </div>

        <div className="mt-8 px-3"><p className="eyebrow">Start here</p></div>
        <nav className="mt-3 flex-1" aria-label="Main navigation">
          <ul className="space-y-1">
            {items.slice(0, 1).map((item) => <NavLink key={item.label} item={item} active={activePage === item.label} onNavigate={onNavigate} />)}
          </ul>
          <p className="mt-7 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">Manage</p>
          <ul className="mt-3 space-y-1">
            {items.slice(1, 4).map((item) => <NavLink key={item.label} item={item} active={activePage === item.label} onNavigate={onNavigate} />)}
          </ul>
          {isAdmin ? <p className="mt-7 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">Workspace</p> : null}
          <ul className="mt-3 space-y-1">
            {items.slice(4).map((item) => <NavLink key={item.label} item={item} active={activePage === item.label} onNavigate={onNavigate} />)}
          </ul>
        </nav>

        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
          <div className="avatar avatar-indigo">{initials(currentUser?.displayName ?? 'LAAP')}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-slate-200">{currentUser?.displayName ?? 'Your account'}</p><p className="truncate text-[11px] text-slate-500">{currentUser ? roleLabel(currentUser.role) : 'Member'}</p></div>
          {onLogout ? <button type="button" onClick={onLogout} className="icon-button h-9 w-9" aria-label="Sign out" title="Sign out"><LogOut aria-hidden="true" size={15} /></button> : null}
        </div>
      </aside>
    </>
  )
}

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: (page: PageName) => void }) {
  const Icon = item.icon
  return <li><button type="button" onClick={() => onNavigate(item.label)} aria-current={active ? 'page' : undefined} className={`nav-link ${active ? 'nav-link-active' : ''}`}><Icon aria-hidden="true" size={17} strokeWidth={active ? 2.2 : 1.8} /><span>{navigationLabel(item.label)}</span>{item.badge ? <span className="ml-auto rounded-full bg-cyan-300/10 px-2 py-0.5 font-mono text-[10px] text-cyan-200">{item.badge}</span> : null}</button></li>
}
