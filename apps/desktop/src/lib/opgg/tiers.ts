import { canonicalRank } from '../profileCustomization.ts'

export { canonicalRank }

export function normalizeOpggRegion(region?: string | null): string {
  if (!region) return 'euw'
  const raw = region.trim().toLowerCase()
  if (raw.startsWith('euw')) return 'euw'
  if (raw.startsWith('eun')) return 'eune'
  if (raw.startsWith('na')) return 'na'
  if (raw.startsWith('kr')) return 'kr'
  if (raw.startsWith('br')) return 'br'
  if (raw.startsWith('lan') || raw === 'la1') return 'lan'
  if (raw.startsWith('las') || raw === 'la2') return 'las'
  if (raw.startsWith('oc')) return 'oce'
  if (raw.startsWith('tr')) return 'tr'
  if (raw.startsWith('ru')) return 'ru'
  if (raw.startsWith('jp')) return 'jp'
  if (raw.startsWith('me')) return 'me'
  if (raw.startsWith('sg')) return 'sg'
  if (raw.startsWith('tw')) return 'tw'
  if (raw.startsWith('vn')) return 'vn'
  if (raw.startsWith('ph')) return 'ph'
  if (raw.startsWith('th')) return 'th'
  return raw
}

export function valorantTierToRank(tier: number): string {
  switch (tier) {
    case 0:
    case 1:
    case 2:
      return 'Unranked'
    case 3:
      return 'Iron 1'
    case 4:
      return 'Iron 2'
    case 5:
      return 'Iron 3'
    case 6:
      return 'Bronze 1'
    case 7:
      return 'Bronze 2'
    case 8:
      return 'Bronze 3'
    case 9:
      return 'Silver 1'
    case 10:
      return 'Silver 2'
    case 11:
      return 'Silver 3'
    case 12:
      return 'Gold 1'
    case 13:
      return 'Gold 2'
    case 14:
      return 'Gold 3'
    case 15:
      return 'Platinum 1'
    case 16:
      return 'Platinum 2'
    case 17:
      return 'Platinum 3'
    case 18:
      return 'Diamond 1'
    case 19:
      return 'Diamond 2'
    case 20:
      return 'Diamond 3'
    case 21:
      return 'Ascendant 1'
    case 22:
      return 'Ascendant 2'
    case 23:
      return 'Ascendant 3'
    case 24:
      return 'Immortal 1'
    case 25:
      return 'Immortal 2'
    case 26:
      return 'Immortal 3'
    case 27:
      return 'Radiant'
    default:
      return 'Unranked'
  }
}

export function romanRank(arabic: string): string {
  switch (arabic.trim()) {
    case '1':
      return 'I'
    case '2':
      return 'II'
    case '3':
      return 'III'
    case '4':
      return 'IV'
    default:
      return arabic.trim()
  }
}
