export const ACTIVE_LEASE_KEY = 'laap_active_lease_v1'

export async function releasePersistedCloudLease(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  release: (sessionId: string) => Promise<unknown>,
  restore?: (sessionId: string) => Promise<unknown>,
): Promise<void> {
  let sessionId: string | undefined
  try {
    const persisted = JSON.parse(storage.getItem(ACTIVE_LEASE_KEY) ?? 'null') as
      | { sessionId?: unknown }
      | null
    if (typeof persisted?.sessionId !== 'string' || !persisted.sessionId) return
    sessionId = persisted.sessionId
  } catch {
    storage.removeItem(ACTIVE_LEASE_KEY)
    return
  }
  await release(sessionId)
  await restore?.(sessionId)
  storage.removeItem(ACTIVE_LEASE_KEY)
}
