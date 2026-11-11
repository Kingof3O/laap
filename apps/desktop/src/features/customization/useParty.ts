import { relayUrl as endpoint } from './communityEndpoint'
import { useEffect, useRef, useState } from 'react'
import { invokeTauri } from '../../lib/api'
import { mods } from './api'

type Request =
  | { type: 'create' }
  | { type: 'join'; invite: string }
  | { type: 'resume'; room: string; token: string }
  | { type: 'leave' }
  | { type: 'rotate' }
  | { type: 'chatConsent'; enabled: boolean }
  | { type: 'chat'; text: string }
  | { type: 'kick'; memberId: string }
  | { type: 'select'; skinId: number | null }
  | { type: 'announceMods'; modHashes: string[] }
  | { type: 'transferRequest'; targetMemberId: string; modHash: string }
  | { type: 'transferAccept'; requesterMemberId: string; modHash: string }
  | { type: 'transferChunk'; targetMemberId: string; modHash: string; chunkIndex: number; totalChunks: number; dataBase64: string }
  | { type: 'transferComplete'; targetMemberId: string; modHash: string }
  | { type: 'transferCancel'; targetMemberId: string; modHash: string; reason: string }

export type Member = { id: string; connected: boolean; selection: number | null; modHashes?: string[] }
type Snapshot = {
  type: 'snapshot'
  room: string
  self: string
  owner: string
  invite: string
  seq: number
  expiresAt: number
  members: Member[]
}
export type PartyMessage = { type: 'chat'; id: string; room: string; memberId: string; text: string; sentAt: number; seq: number }
type Event =
  | PartyMessage
  | Snapshot
  | { type: 'membership'; room: string; token: string }
  | { type: 'error'; message: string }
  | { type: 'expired' }
  | { type: 'left' }
  | { type: 'transferRequest'; fromMemberId: string; modHash: string }
  | { type: 'transferAccept'; fromMemberId: string; modHash: string }
  | { type: 'transferChunk'; fromMemberId: string; modHash: string; chunkIndex: number; totalChunks: number; dataBase64: string }
  | { type: 'transferComplete'; fromMemberId: string; modHash: string }
  | { type: 'transferCancel'; fromMemberId: string; modHash: string; reason: string }

export interface TransferProgress {
  modHash: string
  progress: number
  status: string
}

interface IncomingTransfer {
  modHash: string
  fromMemberId: string
  totalChunks: number
  chunks: string[]
  receivedCount: number
}

export function useParty(onModImported?: (modHash: string) => void) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [state, setState] = useState<'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline'>('idle')
  const [error, setError] = useState('')
  const [chatEnabled, setChatEnabled] = useState(false)
  const [messages, setMessages] = useState<PartyMessage[]>([])
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null)

  const chatConsent = useRef(false)
  const socket = useRef<WebSocket | null>(null)
  const membership = useRef<{ room: string; token: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attempt = useRef(0)
  const incomingTransfers = useRef<Map<string, IncomingTransfer>>(new Map())
  const onModImportedRef = useRef(onModImported)
  onModImportedRef.current = onModImported

  function stop() {
    if (timer.current) clearTimeout(timer.current)
    if (timeout.current) clearTimeout(timeout.current)
    const current = socket.current
    socket.current = null
    membership.current = null
    attempt.current = 0
    chatConsent.current = false
    incomingTransfers.current.clear()
    if (current?.readyState === WebSocket.OPEN) current.send(JSON.stringify({ type: 'leave' }))
    current?.close()
  }

  useEffect(() => () => stop(), [])

  function leave() {
    stop()
    setSnapshot(null)
    setMessages([])
    setChatEnabled(false)
    setTransferProgress(null)
    setState('idle')
    setError('')
  }

  async function handleSendModChunks(requesterMemberId: string, modHash: string) {
    try {
      const pkg = await mods.getPackageData(modHash)
      if (!pkg || !pkg.archiveBase64) return
      send({ type: 'transferAccept', requesterMemberId, modHash })

      const archive = pkg.archiveBase64
      const CHUNK_SIZE = 32 * 1024 // 32 KB chunk
      const totalChunks = Math.ceil(archive.length / CHUNK_SIZE)

      for (let i = 0; i < totalChunks; i++) {
        const slice = archive.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
        send({
          type: 'transferChunk',
          targetMemberId: requesterMemberId,
          modHash,
          chunkIndex: i,
          totalChunks,
          dataBase64: slice,
        })
        await new Promise((r) => setTimeout(r, 5))
      }
      send({ type: 'transferComplete', targetMemberId: requesterMemberId, modHash })
    } catch (e) {
      send({
        type: 'transferCancel',
        targetMemberId: requesterMemberId,
        modHash,
        reason: e instanceof Error ? e.message : 'Mod export failed',
      })
    }
  }

  async function handleCompleteReceivedTransfer(event: { fromMemberId: string; modHash: string }) {
    const record = incomingTransfers.current.get(event.modHash)
    if (!record || record.receivedCount !== record.totalChunks) return

    setTransferProgress({
      modHash: event.modHash,
      progress: 99,
      status: 'Verifying package checksum...',
    })

    const fullBase64 = record.chunks.join('')
    const binary = atob(fullBase64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    const digestBuffer = await crypto.subtle.digest('SHA-256', bytes)
    const calculatedHash = Array.from(new Uint8Array(digestBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    if (calculatedHash.toLowerCase() !== event.modHash.toLowerCase()) {
      setTransferProgress({
        modHash: event.modHash,
        progress: 0,
        status: `Checksum mismatch! Expected ${event.modHash.slice(0, 8)}, got ${calculatedHash.slice(0, 8)}.`,
      })
      incomingTransfers.current.delete(event.modHash)
      return
    }

    try {
      await invokeTauri('mod_import', {
        archive: fullBase64,
        manifest: {
          schemaVersion: 1,
          modId: event.modHash.slice(0, 16),
          displayName: `Synced Mod ${event.modHash.slice(0, 8)}`,
          version: '1.0.0',
          author: `Party Peer ${event.fromMemberId.slice(0, 6)}`,
          championId: 'Synced',
          targetSkinId: '0',
          license: 'Custom Party Sync',
          containsPaidRiotContent: false,
          files: [],
          sha256: event.modHash,
        },
        rightsConfirmed: true,
      })
      setTransferProgress({
        modHash: event.modHash,
        progress: 100,
        status: `Mod ${event.modHash.slice(0, 8)} successfully verified and imported!`,
      })
      onModImportedRef.current?.(event.modHash)
    } catch (e) {
      setTransferProgress({
        modHash: event.modHash,
        progress: 0,
        status: `Import error: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
    incomingTransfers.current.delete(event.modHash)
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
      if (socket.current !== connection || typeof message.data !== 'string' || message.data.length > 256 * 1024) return
      let event: Event
      try {
        event = JSON.parse(message.data) as Event
      } catch {
        return
      }
      if (!event || typeof event !== 'object') return

      if (event.type === 'membership') {
        membership.current = { room: event.room, token: event.token }
        attempt.current = 0
        if (timeout.current) clearTimeout(timeout.current)
        setState('online')
        if (chatConsent.current) connection.send(JSON.stringify({ type: 'chatConsent', enabled: true }))
      } else if (
        event.type === 'snapshot' &&
        event.room === membership.current?.room &&
        Array.isArray(event.members) &&
        event.members.length <= 8
      ) {
        setSnapshot((prior) => (prior?.room === event.room && prior.seq >= event.seq ? prior : event))
      } else if (
        event.type === 'chat' &&
        chatConsent.current &&
        event.room === membership.current?.room &&
        typeof event.id === 'string' &&
        typeof event.memberId === 'string' &&
        typeof event.text === 'string' &&
        event.text.length <= 480 &&
        typeof event.sentAt === 'number'
      ) {
        setMessages((prior) =>
          prior.some((item) => item.id === event.id)
            ? prior
            : [...prior.filter((item) => Date.now() - item.sentAt < 5 * 60_000), event].slice(-20),
        )
      } else if (event.type === 'transferRequest') {
        void handleSendModChunks(event.fromMemberId, event.modHash)
      } else if (event.type === 'transferAccept') {
        setTransferProgress({
          modHash: event.modHash,
          progress: 1,
          status: 'Peer accepted transfer. Receiving chunks...',
        })
      } else if (event.type === 'transferChunk') {
        const key = event.modHash
        let record = incomingTransfers.current.get(key)
        if (!record) {
          record = {
            modHash: event.modHash,
            fromMemberId: event.fromMemberId,
            totalChunks: event.totalChunks,
            chunks: new Array(event.totalChunks).fill(''),
            receivedCount: 0,
          }
          incomingTransfers.current.set(key, record)
        }
        if (!record.chunks[event.chunkIndex]) {
          record.chunks[event.chunkIndex] = event.dataBase64
          record.receivedCount++
          const pct = Math.round((record.receivedCount / record.totalChunks) * 100)
          setTransferProgress({
            modHash: event.modHash,
            progress: pct,
            status: `Downloading: ${pct}% (${record.receivedCount}/${record.totalChunks} chunks)`,
          })
        }
      } else if (event.type === 'transferComplete') {
        void handleCompleteReceivedTransfer(event)
      } else if (event.type === 'transferCancel') {
        setTransferProgress({
          modHash: event.modHash,
          progress: 0,
          status: `Transfer cancelled by peer: ${event.reason}`,
        })
        incomingTransfers.current.delete(event.modHash)
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
    configured: endpoint !== null,
    snapshot,
    state,
    error,
    leave,
    messages,
    chatEnabled,
    transferProgress,
    setChatConsent: (enabled: boolean) => {
      chatConsent.current = enabled
      setChatEnabled(enabled)
      if (!enabled) setMessages([])
      send({ type: 'chatConsent', enabled })
    },
    chat: (text: string) => send({ type: 'chat', text }),
    kick: (memberId: string) => send({ type: 'kick', memberId }),
    create: () => {
      leave()
      open({ type: 'create' })
    },
    join: (invite: string) => {
      leave()
      open({ type: 'join', invite })
    },
    retry: () => {
      if (!membership.current) return
      attempt.current = 0
      open({ type: 'resume', ...membership.current })
    },
    select: (skinId: number | null) => send({ type: 'select', skinId }),
    rotate: () => send({ type: 'rotate' }),
    announceMods: (modHashes: string[]) => send({ type: 'announceMods', modHashes }),
    requestTransfer: (targetMemberId: string, modHash: string) =>
      send({ type: 'transferRequest', targetMemberId, modHash }),
  }
}
