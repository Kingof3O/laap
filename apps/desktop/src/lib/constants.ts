import type { Region } from './types'

export const AVAILABLE_REGIONS: Region[] = [
  'ALL',
  'EUW',
  'EUNE',
  'NA',
  'KR',
  'BR',
  'LAN',
  'LAS',
  'OCE',
  'TR',
  'RU',
  'JP',
]

export const SELECTABLE_REGIONS: Exclude<Region, 'ALL'>[] = [
  'EUW',
  'EUNE',
  'NA',
  'KR',
  'BR',
  'LAN',
  'LAS',
  'OCE',
  'TR',
  'RU',
  'JP',
]

export const AUTH_TOKEN_KEY = 'laap_client_token_v1'
export const AUTH_USER_KEY = 'laap_client_user_v1'
export const VIEW_MODE_KEY = 'laap_view_mode_v1'
