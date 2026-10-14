import { invokeTauri } from './api'
export interface CachedIcon {
  asset: string
  data_url: string
}
export interface IconCatalog {
  version: string
  icons: { id: number; label: string }[]
}
const images = new Map<string, string>()
const pending = new Map<string, Promise<CachedIcon | null>>()
let active = 0
const waiters: (() => void)[] = []
async function limited<T>(action: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>((done) => waiters.push(done))
  else active++
  try {
    return await action()
  } finally {
    const next = waiters.shift()
    if (next) next()
    else active--
  }
}
export function rememberIcon(icon: CachedIcon) {
  images.set(icon.asset, icon.data_url)
  return icon
}
export function peekIcon(asset?: string | null) {
  return asset ? images.get(asset) : undefined
}
export async function readIcon(asset: string) {
  if (images.has(asset)) return images.get(asset)!
  const icon = await invokeTauri<CachedIcon | null>('read_cached_icon', {
    asset,
  })
  if (icon) rememberIcon(icon)
  return icon?.data_url
}
export function loadRiotIcon(
  version: string,
  id: number,
  downloadRequested: boolean,
) {
  const asset = `dd-${version}-${id}.png`
  const stored = images.get(asset)
  if (stored) return Promise.resolve({ asset, data_url: stored })
  const pendingKey = `${asset}:${downloadRequested}`
  if (pending.has(pendingKey)) return pending.get(pendingKey)!
  const operation = limited(async () => {
    const icon = await invokeTauri<CachedIcon | null>('get_profile_icon', {
      version,
      iconId: id,
      downloadRequested,
    })
    if (icon) rememberIcon(icon)
    return icon
  }).finally(() => pending.delete(pendingKey))
  pending.set(pendingKey, operation)
  return operation
}
