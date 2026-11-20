import type { ProfileCustomization } from './types'
export const emptyCustomization = (): ProfileCustomization => ({
  icon_asset: null,
  icon_source: null,
  icon_id: null,
  auto_sync_icon: false,
  auto_sync_rank: false,
  auto_sync_valorant_rank: false,
})
export const RANK_TIERS = [
  'Iron',
  'Bronze',
  'Silver',
  'Gold',
  'Platinum',
  'Emerald',
  'Diamond',
]
export const APEX_TIERS = ['Master', 'Grandmaster', 'Challenger']
export const RANK_OPTIONS = [
  'Unranked',
  ...RANK_TIERS.flatMap((tier) =>
    ['IV', 'III', 'II', 'I'].map((division) => `${tier} ${division}`),
  ),
  ...APEX_TIERS,
]
export function canonicalRank(rank?: string | null) {
  if (!rank) return ''
  const trimmed = rank.trim()
  const exact = RANK_OPTIONS.find(
    (option) => option.toLowerCase() === trimmed.toLowerCase(),
  )
  if (exact) return exact
  const match = trimmed.match(
    /^(iron|bronze|silver|gold|platinum|emerald|diamond)\s+([1-4])(?:\s*\(?(\d+\s*LP)\)?)?$/i,
  )
  if (match) {
    const tier = RANK_TIERS.find(
      (t) => t.toLowerCase() === match[1].toLowerCase(),
    )
    const div = ['', 'I', 'II', 'III', 'IV'][Number(match[2])]
    if (match[3]) {
      return `${tier} ${div} (${match[3].toUpperCase()})`
    }
    return `${tier} ${div}`
  }
  const apexMatch = trimmed.match(
    /^(master|grandmaster|challenger)(?:\s*\(?(\d+\s*LP)\)?)?$/i,
  )
  if (apexMatch) {
    const tier = APEX_TIERS.find(
      (t) => t.toLowerCase() === apexMatch[1].toLowerCase(),
    )
    if (apexMatch[2]) {
      return `${tier} (${apexMatch[2].toUpperCase()})`
    }
    return tier ?? trimmed
  }
  return trimmed
}
export function rankCrest(rank?: string | null) {
  if (!rank) return null
  const firstWord = rank.trim().split(/\s+/)[0].toLowerCase()
  const tier = [...RANK_TIERS, ...APEX_TIERS].find(
    (t) => t.toLowerCase() === firstWord,
  )
  if (!tier) return null
  return `/rank-crests/${tier.toLowerCase()}.png`
}

export const VALORANT_TIERS = [
  'Iron',
  'Bronze',
  'Silver',
  'Gold',
  'Platinum',
  'Diamond',
  'Ascendant',
  'Immortal',
] as const

export const VALORANT_RANK_OPTIONS = [
  'Unranked',
  ...VALORANT_TIERS.flatMap((tier) =>
    ['1', '2', '3'].map((division) => `${tier} ${division}`),
  ),
  'Radiant',
]

export function canonicalValorantRank(rank?: string | null): string {
  if (!rank) return ''
  const trimmed = rank.trim()
  const exact = VALORANT_RANK_OPTIONS.find(
    (option) => option.toLowerCase() === trimmed.toLowerCase(),
  )
  if (exact) return exact

  const match = trimmed.match(
    /^(iron|bronze|silver|gold|platinum|diamond|ascendant|immortal)\s*(?:([1-3])|(iii|ii|i))$/i,
  )
  if (match) {
    const tier = VALORANT_TIERS.find(
      (t) => t.toLowerCase() === match[1].toLowerCase(),
    )
    const romanMap: Record<string, string> = { i: '1', ii: '2', iii: '3' }
    const div = match[2] ?? (match[3] ? romanMap[match[3].toLowerCase()] : '1')
    return `${tier} ${div}`
  }
  if (trimmed.toLowerCase() === 'radiant') return 'Radiant'
  if (trimmed.toLowerCase() === 'unranked') return 'Unranked'
  return trimmed
}
