import type { Region } from './types'

export const REGION_GROUPS: {
  label: string
  regions: { value: Exclude<Region, 'ALL'>; label: string }[]
}[] = [
  {
    label: 'Europe',
    regions: [
      { value: 'EUW', label: 'Europe West' },
      { value: 'EUNE', label: 'Europe Nordic & East' },
      { value: 'TR', label: 'Turkey' },
      { value: 'RU', label: 'Russia' },
    ],
  },
  {
    label: 'Americas',
    regions: [
      { value: 'NA', label: 'North America' },
      { value: 'BR', label: 'Brazil' },
      { value: 'LAN', label: 'Latin America North' },
      { value: 'LAS', label: 'Latin America South' },
    ],
  },
  {
    label: 'Asia',
    regions: [
      { value: 'KR', label: 'Korea' },
      { value: 'JP', label: 'Japan' },
    ],
  },
  {
    label: 'Oceania & SEA',
    regions: [
      { value: 'OCE', label: 'Oceania' },
      { value: 'SG', label: 'Singapore / MY / ID' },
      { value: 'TW', label: 'Taiwan' },
      { value: 'VN', label: 'Vietnam' },
      { value: 'PH', label: 'Philippines' },
      { value: 'TH', label: 'Thailand' },
    ],
  },
  { label: 'Middle East', regions: [{ value: 'ME', label: 'Middle East' }] },
]
export const SELECTABLE_REGIONS = REGION_GROUPS.flatMap((group) =>
  group.regions.map((region) => region.value),
)
export const AVAILABLE_REGIONS: Region[] = ['ALL', ...SELECTABLE_REGIONS, 'SEA']

export const AUTH_TOKEN_KEY = 'laap_client_token_v1'
export const AUTH_USER_KEY = 'laap_client_user_v1'
export const VIEW_MODE_KEY = 'laap_view_mode_v1'
