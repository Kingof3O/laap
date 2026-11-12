import { useEffect, useRef, useState } from 'react'
import { readFileBase64, readResponseBytes } from './packageFiles'

/** Fetch bounded raster bytes through connect-src; never widen the desktop image CSP. */
export function MarketplacePreview({ origin, source, title }: { origin: string; source: string; title: string }) {
  const element = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [uri, setUri] = useState('')
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '100px' })
    if (element.current) observer.observe(element.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    const timeout = window.setTimeout(() => { setFailed(true); controller.abort() }, 15000)
    setUri(''); setFailed(false)
    void (async () => {
      if (!/^\/v1\/marketplace\/previews\/[a-f0-9-]{36}$/.test(source)) throw Error('Invalid preview reference')
      const response = await fetch(origin + source, { signal: controller.signal })
      if (!response.ok) throw Error('Preview unavailable')
      const type = response.headers.get('content-type')?.split(';')[0]
      if (!type || !['image/png', 'image/jpeg', 'image/webp'].includes(type)) throw Error('Unsupported preview media')
      const bytes = await readResponseBytes(response, 5 * 1024 * 1024)
      const base64 = await readFileBase64(new File([bytes], 'preview', { type }), controller.signal)
      if (!controller.signal.aborted) setUri(`data:${type};base64,${base64}`)
    })().catch(() => { if (!controller.signal.aborted) setFailed(true) })
      .finally(() => clearTimeout(timeout))
    return () => { clearTimeout(timeout); controller.abort() }
  }, [origin, source, visible, retry])
  return <div ref={element} style={{ minHeight: 100 }}>
    {uri ? <img src={uri} alt={`Preview: ${title}`} style={{ width: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 6 }} onError={() => { setFailed(true); setUri('') }} />
      : <span>{failed ? <>Preview unavailable <button className="btn-secondary" onClick={() => setRetry(value => value + 1)}>Retry preview</button></> : 'Loading preview…'}</span>}
  </div>
}
