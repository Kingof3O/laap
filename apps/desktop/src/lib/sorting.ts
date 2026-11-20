export type SortOrder =
  | 'name-asc'
  | 'name-desc'
  | 'rank-desc'
  | 'rank-asc'
  | 'last-played'
  | 'added-desc'
  | 'added-asc'
  | 'region-asc'
  | 'region-desc'
  | 'status-asc'
  | 'status-desc'
  | 'favorites-first'
const tiers = [
  'iron',
  'bronze',
  'silver',
  'gold',
  'platinum',
  'emerald',
  'diamond',
  'master',
  'grandmaster',
  'challenger',
]
export function rankScore(rank?: string | null): number | null {
  const match = rank
    ?.trim()
    .match(
      /^(iron|bronze|silver|gold|platinum|emerald|diamond|master|grandmaster|challenger)(?:\s+(IV|III|II|I|[1-4]))?$/i,
    )
  if (!match) return null
  const tier = tiers.indexOf(match[1].toLowerCase())
  const division = match[2]?.toUpperCase()
  if (tier >= 7 && division) return null
  const value = division
    ? ({ I: 4, II: 3, III: 2, IV: 1, '1': 4, '2': 3, '3': 2, '4': 1 }[
        division
      ] ?? 0)
    : 0
  return tier + value / 10
}
export interface Sortable {
  id: string
  name: string
  rank?: string | null
  created_at?: string
  last_used_at?: string | null
  favorite?: boolean
  region?: string
  status?: string
}
const date = (value?: string | null) => {
  const timestamp = value ? Date.parse(value) : 0
  return Number.isFinite(timestamp) ? timestamp : 0
}
export function sortProfiles<T extends Sortable>(
  profiles: readonly T[],
  order: SortOrder,
  options?: { pinFavorites?: boolean },
): T[] {
  const pinFavorites = options?.pinFavorites ?? (order === 'favorites-first')
  return [...profiles].sort((a, b) => {
    if (pinFavorites || order === 'favorites-first') {
      const favA = Boolean(a.favorite)
      const favB = Boolean(b.favorite)
      if (favA !== favB) return favA ? -1 : 1
    }

    const name =
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      }) || a.id.localeCompare(b.id)

    if (order === 'favorites-first') {
      const favA = Boolean(a.favorite)
      const favB = Boolean(b.favorite)
      if (favA !== favB) return favA ? -1 : 1
      return name
    }

    if (order.startsWith('rank-')) {
      const left = rankScore(a.rank),
        right = rankScore(b.rank)
      if (left === null || right === null)
        return left === right ? name : left === null ? 1 : -1
      return (order === 'rank-desc' ? right - left : left - right) || name
    }

    if (order === 'name-desc') return -name
    if (order === 'name-asc') return name

    if (order.startsWith('region-')) {
      const regA = (a.region ?? '').toUpperCase()
      const regB = (b.region ?? '').toUpperCase()
      const regCmp = regA.localeCompare(regB) || name
      return order === 'region-desc' ? -regCmp : regCmp
    }

    if (order.startsWith('status-')) {
      const statA = a.status ?? ''
      const statB = b.status ?? ''
      const statCmp = statA.localeCompare(statB) || name
      return order === 'status-desc' ? -statCmp : statCmp
    }

    if (order === 'last-played')
      return date(b.last_used_at) - date(a.last_used_at) || name
    if (order === 'added-desc')
      return date(b.created_at) - date(a.created_at) || name
    if (order === 'added-asc')
      return date(a.created_at) - date(b.created_at) || name

    return name
  })
}

export function getRankTierClass(rank?: string | null): string {
  if (!rank) return ''
  const lower = rank.toLowerCase()
  if (lower.includes('challenger')) return 'rank-challenger'
  if (lower.includes('grandmaster')) return 'rank-grandmaster'
  if (lower.includes('master')) return 'rank-master'
  if (lower.includes('diamond')) return 'rank-diamond'
  if (lower.includes('emerald')) return 'rank-emerald'
  if (lower.includes('platinum')) return 'rank-platinum'
  if (lower.includes('gold')) return 'rank-gold'
  return ''
}

export function formatRelativeTime(value?: string | null): string {
  if (!value) return 'Never played'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  const diffSec = Math.floor((Date.now() - timestamp) / 1000)
  if (diffSec < 60) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  const diffDays = Math.floor(diffHour / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
