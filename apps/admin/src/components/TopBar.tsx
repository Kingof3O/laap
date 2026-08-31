import { Bell, Command, Menu, Search, Wifi } from 'lucide-react'
import type { PageName } from '../lib/data'

type TopBarProps = { activePage: PageName; onMenu: () => void; query: string; onQueryChange: (value: string) => void; onNotify: () => void }

export function TopBar({ activePage, onMenu, query, onQueryChange, onNotify }: TopBarProps) {
  return <header className="flex min-h-[76px] items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-4 sm:px-8 lg:px-10">
    <div className="flex min-w-0 items-center gap-3">
      <button type="button" onClick={onMenu} className="icon-button lg:hidden" aria-label="Open navigation"><Menu aria-hidden="true" size={20} /></button>
      <div className="min-w-0"><p className="eyebrow hidden sm:block">LAAP / {activePage}</p><p className="truncate text-sm font-medium text-slate-300 sm:mt-1 sm:text-xs sm:text-slate-500">Monday, August 31, 2026</p></div>
    </div>
    <div className="flex items-center gap-2 sm:gap-3">
      <label className="relative hidden w-[210px] md:block"><span className="sr-only">Search accounts and users</span><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={15} /><input aria-label="Search accounts and users" value={query} onChange={(event) => onQueryChange(event.target.value)} className="input-base h-10 w-full pl-9 pr-10 text-xs" placeholder="Search anything..." type="search" /><span className="kbd-hint" aria-hidden="true"><Command aria-hidden="true" size={11} />K</span></label>
      <span className="hidden items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[11px] text-slate-500 sm:inline-flex"><Wifi aria-hidden="true" size={13} className="text-emerald-300" />Live sync</span>
      <button type="button" onClick={onNotify} className="icon-button relative" aria-label="View notifications"><Bell aria-hidden="true" size={18} /><span className="notification-dot" aria-hidden="true" /></button>
      <div className="avatar avatar-indigo hidden sm:flex" aria-label="Signed in as Alex Kim">AK</div>
    </div>
  </header>
}
