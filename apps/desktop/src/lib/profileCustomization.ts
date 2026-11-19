import type { ProfileCustomization } from './types'
export const emptyCustomization = (): ProfileCustomization => ({
  icon_asset: null,
  icon_source: null,
  icon_id: null,
  auto_sync_icon: false,
  auto_sync_rank: false,
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
