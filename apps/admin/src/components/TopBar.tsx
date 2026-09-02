import { Menu } from 'lucide-react'
import type { PageName } from '../lib/data'
import { navigationLabel } from '../lib/labels'

type TopBarProps = { activePage: PageName; onMenu: () => void }

export function TopBar({ activePage, onMenu }: TopBarProps) {
  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())
  return <header className="flex min-h-[76px] items-center gap-3 border-b border-white/[0.06] px-5 py-4 sm:px-8 lg:px-10"><button type="button" onClick={onMenu} className="icon-button lg:hidden" aria-label="Open navigation"><Menu aria-hidden="true" size={20} /></button><div className="min-w-0"><p className="eyebrow hidden sm:block">{navigationLabel(activePage)}</p><p className="truncate text-sm font-medium text-slate-300 sm:mt-1 sm:text-xs sm:text-slate-500">{today}</p></div></header>
}
