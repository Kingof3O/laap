import { relayUrl as endpoint } from './communityEndpoint'
import { useEffect, useRef, useState } from 'react'

type Request = { type: 'create' } | { type: 'join'; invite: string } |
  { type: 'resume'; room: string; token: string } | { type: 'leave' } |
  { type: 'rotate' } | { type: 'chatConsent'; enabled: boolean } | { type: 'chat'; text: string } | { type: 'kick'; memberId: string } | { type: 'select'; skinId: number | null }
type Member = { id: string; connected: boolean; selection: number | null }
type Snapshot = {
  type: 'snapshot'; room: string; self: string; owner: string; invite: string;
  seq: number; expiresAt: number; members: Member[]
}
export type PartyMessage = { type: 'chat'; id: string; room: string; memberId: string; text: string; sentAt: number; seq: number }
type Event = PartyMessage | Snapshot | { type: 'membership'; room: string; token: string } |
  { type: 'error'; message: string } | { type: 'expired' } | { type: 'left' }

export function useParty() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [state, setState] = useState<'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline'>('idle')
  const [error, setError] = useState('')
  const [chatEnabled, setChatEnabled] = useState(false)
  const [messages, setMessages] = useState<PartyMessage[]>([])
  const chatConsent = useRef(false)
  const socket = useRef<WebSocket | null>(null)
  const membership = useRef<{ room: string; token: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attempt = useRef(0)

  function stop() {
    if (timer.current) clearTimeout(timer.current)
    if (timeout.current) clearTimeout(timeout.current)
    const current = socket.current
    socket.current = null
    membership.current = null
    attempt.current = 0
    chatConsent.current = false
    if (current?.readyState === WebSocket.OPEN) current.send(JSON.stringify({ type: 'leave' }))
    current?.close()
  }

  useEffect(() => () => stop(), [])

  function leave() {
    stop()
    setSnapshot(null)
    setMessages([])
    setChatEnabled(false)
    setState('idle')
    setError('')
  }

  function open(request: Request) {
    if (!endpoint) return
    setState(request.type === 'resume' ? 'reconnecting' : 'connecting')
    setError('')
    let connection: WebSocket
    try {
      connection = new WebSocket(endpoint)
    } catch {
      setState('offline')
      setError('Party relay connection was blocked.')
      return
    }
    socket.current = connection
    timeout.current = setTimeout(() => connection.close(), 8_000)
    connection.addEventListener('open', () => {
      if (socket.current === connection) connection.send(JSON.stringify(request))
    })
    connection.addEventListener('message', (message) => {
      if (socket.current !== connection || typeof message.data !== 'string' || message.data.length > 8_192) return
      let event: Event
      try { event = JSON.parse(message.data) as Event } catch { return }
      if (!event || typeof event !== 'object') return
      if (event.type === 'membership') {
        membership.current = { room: event.room, token: event.token }
        attempt.current = 0
        if (timeout.current) clearTimeout(timeout.current)
        setState('online')
        if (chatConsent.current) connection.send(JSON.stringify({ type: 'chatConsent', enabled: true }))
      } else if (event.type === 'snapshot' && event.room === membership.current?.room &&
        Array.isArray(event.members) && event.members.length <= 8) {
        setSnapshot((prior) => prior?.room === event.room && prior.seq >= event.seq ? prior : event)
      } else if (event.type === 'chat' && chatConsent.current && event.room === membership.current?.room &&
        typeof event.id === 'string' && typeof event.memberId === 'string' && typeof event.text === 'string' &&
        event.text.length <= 480 && typeof event.sentAt === 'number') {
        setMessages((prior) => prior.some((item) => item.id === event.id) ? prior :
          [...prior.filter((item) => Date.now() - item.sentAt < 5 * 60_000), event].slice(-20))
      } else if (event.type === 'expired') {
        leave()
        setError('The room expired. Create or join another room.')
      } else if (event.type === 'error' && typeof event.message === 'string') {
        setError(event.message)
        if (!membership.current) {
          stop()
          setState('idle')
        }
      }
    })
    connection.addEventListener('close', (event) => {
      if (socket.current !== connection) return
      socket.current = null
      if (timeout.current) clearTimeout(timeout.current)
      const current = membership.current
      if (event.code === 4000 || event.code === 4001) {
        leave()
        setError('The room ended or this connection was replaced.')
      } else if (current && attempt.current < 5) {
        setState('reconnecting')
        const delay = Math.min(8_000, 500 * 2 ** attempt.current++)
        timer.current = setTimeout(() => open({ type: 'resume', ...current }), delay)
      } else {
        setState('offline')
        setError('Could not connect to the party relay.')
      }
    })
  }

  function send(request: Request) {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(request))
  }

  return {
    configured: endpoint !== null, snapshot, state, error, leave, messages, chatEnabled,
    setChatConsent: (enabled: boolean) => {
      chatConsent.current = enabled
      setChatEnabled(enabled)
      if (!enabled) setMessages([])
      send({ type: 'chatConsent', enabled })
    },
    chat: (text: string) => send({ type: 'chat', text }),
    kick: (memberId: string) => send({ type: 'kick', memberId }),
    create: () => { leave(); open({ type: 'create' }) },
    join: (invite: string) => { leave(); open({ type: 'join', invite }) },
    retry: () => {
      if (!membership.current) return
      attempt.current = 0
      open({ type: 'resume', ...membership.current })
    },
    select: (skinId: number | null) => send({ type: 'select', skinId }),
    rotate: () => send({ type: 'rotate' }),
  }
}
