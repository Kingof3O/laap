function relayEndpoint(): string | null {
  const configured = import.meta.env.VITE_COMMUNITY_RELAY_URL
  if (!configured) return import.meta.env.DEV ? 'ws://127.0.0.1:4171/v1/rooms/events' : null
  try {
    const url = new URL(configured)
    return (url.protocol === 'wss:' || (import.meta.env.DEV && url.protocol === 'ws:' && ['127.0.0.1','localhost'].includes(url.hostname))) && !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === '/v1/rooms/events' ? url.href : null
  } catch {
    return null
  }
}

export const relayUrl = relayEndpoint()


export const catalogOrigin = relayUrl ? new URL(relayUrl.replace(/^ws/, 'http')).origin : null
