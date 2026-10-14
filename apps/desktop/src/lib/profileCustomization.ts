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
  const exact = RANK_OPTIONS.find(
    (option) => option.toLowerCase() === rank.trim().toLowerCase(),
  )
  if (exact) return exact
  const match = rank
    .trim()
    .match(/^(iron|bronze|silver|gold|platinum|emerald|diamond)\s+([1-4])$/i)
  return match
    ? `${RANK_TIERS.find((tier) => tier.toLowerCase() === match[1].toLowerCase())} ${['', 'I', 'II', 'III', 'IV'][Number(match[2])]}`
    : rank
}
export function rankCrest(rank?: string | null) {
  const canonical = canonicalRank(rank)
  if (
    !RANK_OPTIONS.includes(canonical) &&
    !RANK_TIERS.some((tier) => tier.toLowerCase() === canonical.toLowerCase())
  )
    return null
  return `/rank-crests/${canonical.split(' ')[0].toLowerCase()}.png`
}
