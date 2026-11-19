const API_ORIGIN = 'https://laap-billing-sandbox.hussiensalah100.workers.dev'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/v1' || url.pathname.startsWith('/v1/')) {
      const upstream = new URL(`${API_ORIGIN}${url.pathname}${url.search}`)
      const headers = new Headers(request.headers)
      headers.set('x-laap-pages-proxy', '1')
      return fetch(new Request(upstream, { method: request.method, headers, body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body, redirect: 'manual' }))
    }
    return env.ASSETS.fetch(request)
  },
}
