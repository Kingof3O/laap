import type { CatalogHandler } from './catalog.ts'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { WebSocket, WebSocketServer, type RawData } from 'ws'

const ROOM_TTL = 60 * 60 * 1000
const RECONNECT_WINDOW = 2 * 60 * 1000
const MAX_ROOMS = 250
const MAX_MEMBERS = 8
const MAX_CLIENTS = 500
const MAX_BUFFER = 128 * 1024

type Member = {
  id: string
  token: string
  socket?: WebSocket
  absentAt?: number
  selection: number | null
  modHashes: string[]
  joinedAt: number
  chatEnabled: boolean
}

type Room = {
  id: string
  invite: string
  seq: number
  owner: string
  expiresAt: number
  members: Map<string, Member>
}

type Message =
  | { type: 'create' }
  | { type: 'join'; invite: string }
  | { type: 'resume'; room: string; token: string }
  | { type: 'select'; skinId: number | null }
  | { type: 'rotate' }
  | { type: 'leave' }
  | { type: 'chatConsent'; enabled: boolean }
  | { type: 'chat'; text: string }
  | { type: 'kick'; memberId: string }
  | { type: 'announceMods'; modHashes: string[] }
  | { type: 'transferRequest'; targetMemberId: string; modHash: string }
  | { type: 'transferAccept'; requesterMemberId: string; modHash: string }
  | { type: 'transferChunk'; targetMemberId: string; modHash: string; chunkIndex: number; totalChunks: number; dataBase64: string }
  | { type: 'transferComplete'; targetMemberId: string; modHash: string }
  | { type: 'transferCancel'; targetMemberId: string; modHash: string; reason?: string }

const key = (length: number) => randomBytes(length).toString('hex')
const exact = (value: Record<string, unknown>, ...keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((name) => Object.hasOwn(value, name))
const validKey = (value: unknown, length: number): value is string =>
  typeof value === 'string' && value.length === length && /^[a-f0-9]+$/.test(value)

function parse(raw: RawData): Message {
  const row: unknown = JSON.parse(raw.toString())
  if (!row || Array.isArray(row) || typeof row !== 'object') throw new Error('Invalid party message.')
  const message = row as Record<string, unknown>
  switch (message.type) {
    case 'create': case 'rotate': case 'leave':
      if (exact(message, 'type')) return { type: message.type }
      break
    case 'join':
      if (exact(message, 'type', 'invite') && validKey(message.invite, 12)) {
        return { type: 'join', invite: message.invite }
      }
      break
    case 'resume':
      if (exact(message, 'type', 'room', 'token') && validKey(message.room, 32) && validKey(message.token, 64)) {
        return { type: 'resume', room: message.room, token: message.token }
      }
      break
    case 'chatConsent':
      if (exact(message, 'type', 'enabled') && typeof message.enabled === 'boolean') {
        return { type: 'chatConsent', enabled: message.enabled }
      }
      break
    case 'chat':
      if (exact(message, 'type', 'text') && typeof message.text === 'string' &&
        message.text.trim().length > 0 && [...message.text].length <= 240 &&
        !/[\u0000-\u001f\u007f]/u.test(message.text)) {
        return { type: 'chat', text: message.text.trim() }
      }
      break
    case 'kick':
      if (exact(message, 'type', 'memberId') && validKey(message.memberId, 16)) {
        return { type: 'kick', memberId: message.memberId }
      }
      break
    case 'select': {
      const skinId = message.skinId
      if (exact(message, 'type', 'skinId') && (skinId === null ||
        (typeof skinId === 'number' && Number.isSafeInteger(skinId) && skinId > 0 && skinId <= 99_999_999))) {
        return { type: 'select', skinId }
      }
      break
    }
    case 'announceMods': {
      if (exact(message, 'type', 'modHashes') && Array.isArray(message.modHashes) &&
        message.modHashes.length <= 50 &&
        message.modHashes.every((h) => validKey(h, 64))) {
        return { type: 'announceMods', modHashes: message.modHashes as string[] }
      }
      break
    }
    case 'transferRequest': {
      if (exact(message, 'type', 'targetMemberId', 'modHash') &&
        validKey(message.targetMemberId, 16) && validKey(message.modHash, 64)) {
        return { type: 'transferRequest', targetMemberId: message.targetMemberId, modHash: message.modHash }
      }
      break
    }
    case 'transferAccept': {
      if (exact(message, 'type', 'requesterMemberId', 'modHash') &&
        validKey(message.requesterMemberId, 16) && validKey(message.modHash, 64)) {
        return { type: 'transferAccept', requesterMemberId: message.requesterMemberId, modHash: message.modHash }
      }
      break
    }
    case 'transferChunk': {
      if (exact(message, 'type', 'targetMemberId', 'modHash', 'chunkIndex', 'totalChunks', 'dataBase64') &&
        validKey(message.targetMemberId, 16) && validKey(message.modHash, 64) &&
        typeof message.chunkIndex === 'number' && Number.isSafeInteger(message.chunkIndex) && message.chunkIndex >= 0 &&
        typeof message.totalChunks === 'number' && Number.isSafeInteger(message.totalChunks) && message.totalChunks > 0 &&
        typeof message.dataBase64 === 'string' && message.dataBase64.length <= 64 * 1024) {
        return {
          type: 'transferChunk',
          targetMemberId: message.targetMemberId,
          modHash: message.modHash,
          chunkIndex: message.chunkIndex,
          totalChunks: message.totalChunks,
          dataBase64: message.dataBase64,
        }
      }
      break
    }
    case 'transferComplete': {
      if (exact(message, 'type', 'targetMemberId', 'modHash') &&
        validKey(message.targetMemberId, 16) && validKey(message.modHash, 64)) {
        return { type: 'transferComplete', targetMemberId: message.targetMemberId, modHash: message.modHash }
      }
      break
    }
    case 'transferCancel': {
      if ((exact(message, 'type', 'targetMemberId', 'modHash') || exact(message, 'type', 'targetMemberId', 'modHash', 'reason')) &&
        validKey(message.targetMemberId, 16) && validKey(message.modHash, 64) &&
        (message.reason === undefined || (typeof message.reason === 'string' && message.reason.length <= 100))) {
        return {
          type: 'transferCancel',
          targetMemberId: message.targetMemberId,
          modHash: message.modHash,
          reason: typeof message.reason === 'string' ? message.reason : undefined,
        }
      }
      break
    }
  }
  throw new Error('Invalid party message.')
}

function send(socket: WebSocket | undefined, message: unknown) {
  if (socket?.readyState !== WebSocket.OPEN) return
  if (socket.bufferedAmount > MAX_BUFFER) {
    socket.close(1008, 'Client is too slow')
    return
  }
  socket.send(JSON.stringify(message))
}

export function createCommunityServer({ origins, catalog, moderation, marketplace }: {
  origins: ReadonlySet<string>
  catalog?: CatalogHandler
  moderation?: CatalogHandler
  marketplace?: CatalogHandler
}) {
  const rooms = new Map<string, Room>()
  const invites = new Map<string, Room>()
  const connections = new Map<string, number>()
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'application/json')
    if (moderation?.(req, res)) return
    if (marketplace?.(req, res)) return
    if (catalog?.(req, res)) return
    if (req.method === 'GET' && req.url === '/v1/service/health') {
      res.end('{"status":"ok"}')
    } else {
      res.statusCode = 404
      res.end('{"error":"Not found"}')
    }
  })
  server.headersTimeout = 10_000
  server.requestTimeout = 10_000
  server.maxConnections = MAX_CLIENTS + 50
  const ws = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024, perMessageDeflate: false })

  function nextInvite() {
    let invite = key(6)
    while (invites.has(invite)) invite = key(6)
    return invite
  }

  function dropRoom(room: Room) {
    rooms.delete(room.id)
    invites.delete(room.invite)
    for (const member of room.members.values()) member.socket?.close(4000, 'Room ended')
  }

  function publish(room: Room) {
    room.seq += 1
    const members = [...room.members.values()].map(({ id, selection, modHashes, socket }) => ({
      id, selection, modHashes: modHashes ?? [], connected: socket?.readyState === WebSocket.OPEN,
    }))
    for (const member of room.members.values()) {
      send(member.socket, { type: 'snapshot', room: room.id, seq: room.seq, invite: room.invite,
        owner: room.owner, self: member.id, expiresAt: room.expiresAt, members })
    }
  }

  function remove(room: Room, member: Member) {
    room.members.delete(member.id)
    if (!room.members.size) return dropRoom(room)
    if (room.owner === member.id) {
      const candidates = [...room.members.values()]
      room.owner = (candidates.find((item) => item.socket?.readyState === WebSocket.OPEN) ?? candidates[0]!).id
    }
    publish(room)
  }

  const alive = new WeakSet<WebSocket>()
  const timer = setInterval(() => {
    const now = Date.now()
    for (const room of rooms.values()) {
      if (room.expiresAt <= now) {
        dropRoom(room)
        continue
      }
      for (const member of room.members.values()) {
        if (member.absentAt && now - member.absentAt > RECONNECT_WINDOW) remove(room, member)
      }
    }
    for (const socket of ws.clients) {
      if (!alive.delete(socket)) socket.terminate()
      else if (socket.readyState === WebSocket.OPEN) socket.ping()
    }
  }, 15_000)
  timer.unref()

  server.on('upgrade', (req, socket, head) => {
    const ip = req.socket.remoteAddress ?? ''
    const count = connections.get(ip) ?? 0
    if (req.url !== '/v1/rooms/events' || !req.headers.origin || !origins.has(req.headers.origin)
      || count >= 16 || ws.clients.size >= MAX_CLIENTS) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    ws.handleUpgrade(req, socket, head, (client) => {
      connections.set(ip, count + 1)
      ws.emit('connection', client)
      client.once('close', () => {
        const remaining = (connections.get(ip) ?? 1) - 1
        if (remaining <= 0) connections.delete(ip)
        else connections.set(ip, remaining)
      })
    })
  })

  ws.on('connection', (socket) => {
    let room: Room | undefined
    let member: Member | undefined
    let windowStart = Date.now()
    let sent = 0
    alive.add(socket)
    socket.on('pong', () => alive.add(socket))
    socket.on('error', () => { socket.terminate() })
    const handshake = setTimeout(() => {
      if (!room) socket.close(1008, 'Membership required')
    }, 10_000)
    handshake.unref()
    socket.on('message', (raw, binary) => {
      try {
        const now = Date.now()
        if (now - windowStart >= 10_000) { windowStart = now; sent = 0 }
        if (++sent > 100 || binary) { socket.close(1008, 'Message limit exceeded'); return }
        const message = parse(raw)
        if (member && room) {
          if (member.socket !== socket || !rooms.has(room.id) || room.expiresAt <= now) {
            socket.close(4000, 'Room ended')
            return
          }
          if (message.type === 'leave') {
            remove(room, member)
            room = undefined
            member = undefined
            send(socket, { type: 'left' })
            socket.close(1000, 'Left room')
          } else if (message.type === 'select') {
            member.selection = message.skinId
            publish(room)
          } else if (message.type === 'announceMods') {
            member.modHashes = message.modHashes
            publish(room)
          } else if (message.type === 'transferRequest') {
            const target = room.members.get(message.targetMemberId)
            if (target) send(target.socket, { type: 'transferRequest', fromMemberId: member.id, modHash: message.modHash })
          } else if (message.type === 'transferAccept') {
            const requester = room.members.get(message.requesterMemberId)
            if (requester) send(requester.socket, { type: 'transferAccept', fromMemberId: member.id, modHash: message.modHash })
          } else if (message.type === 'transferChunk') {
            const target = room.members.get(message.targetMemberId)
            if (target) send(target.socket, {
              type: 'transferChunk',
              fromMemberId: member.id,
              modHash: message.modHash,
              chunkIndex: message.chunkIndex,
              totalChunks: message.totalChunks,
              dataBase64: message.dataBase64,
            })
          } else if (message.type === 'transferComplete') {
            const target = room.members.get(message.targetMemberId)
            if (target) send(target.socket, { type: 'transferComplete', fromMemberId: member.id, modHash: message.modHash })
          } else if (message.type === 'transferCancel') {
            const target = room.members.get(message.targetMemberId)
            if (target) send(target.socket, { type: 'transferCancel', fromMemberId: member.id, modHash: message.modHash, reason: message.reason })
          } else if (message.type === 'chatConsent') {
            member.chatEnabled = message.enabled
          } else if (message.type === 'chat' && member.chatEnabled) {
            room.seq += 1
            const messageEvent = { type: 'chat', room: room.id, seq: room.seq, id: key(8),
              memberId: member.id, text: message.text, sentAt: now }
            for (const recipient of room.members.values()) {
              if (recipient.chatEnabled) send(recipient.socket, messageEvent)
            }
          } else if (message.type === 'kick' && room.owner === member.id && message.memberId !== member.id) {
            const target = room.members.get(message.memberId)
            if (!target) throw new Error('Member no longer belongs to this room.')
            remove(room, target)
            target.socket?.close(4000, 'Removed by the room host')
          } else if (message.type === 'rotate' && room.owner === member.id) {
            invites.delete(room.invite)
            room.invite = nextInvite()
            invites.set(room.invite, room)
            publish(room)
          } else throw new Error('Action unavailable for this membership.')
          return
        }

        let target: Room
        if (message.type === 'resume') {
          const prior = rooms.get(message.room)
          const entry = [...(prior?.members.values() ?? [])].find((item) => item.token === message.token)
          if (!prior || !entry || prior.expiresAt <= now ||
            (entry.absentAt !== undefined && now - entry.absentAt > RECONNECT_WINDOW)) {
            send(socket, { type: 'expired' })
            socket.close(4000, 'Membership expired')
            return
          }
          target = prior
          const previousSocket = entry.socket
          entry.socket = socket
          entry.absentAt = undefined
          previousSocket?.close(4001, 'Connection replaced')
          member = entry
        } else if (message.type === 'create' || message.type === 'join') {
          if (message.type === 'create') {
            if (rooms.size >= MAX_ROOMS) throw new Error('The party service is full.')
            target = { id: key(16), invite: nextInvite(), seq: 0, owner: '',
              expiresAt: now + ROOM_TTL, members: new Map() }
            rooms.set(target.id, target)
            invites.set(target.invite, target)
          } else {
            const found = invites.get(message.invite)
            if (!found || found.expiresAt <= now) throw new Error('Invite is invalid or expired.')
            if (found.members.size >= MAX_MEMBERS) throw new Error('This room is full.')
            target = found
          }
          member = { id: key(8), token: key(32), socket, selection: null, modHashes: [], joinedAt: now, chatEnabled: false }
          target.members.set(member.id, member)
          if (!target.owner) target.owner = member.id
        } else throw new Error('Create or join a room first.')

        room = target
        clearTimeout(handshake)
        send(socket, { type: 'membership', room: room.id, token: member.token })
        publish(room)
      } catch (cause) {
        send(socket, { type: 'error', message: cause instanceof SyntaxError ? 'Invalid party message.' :
          cause instanceof Error ? cause.message : 'Party request failed.' })
      }
    })
    socket.on('close', () => {
      clearTimeout(handshake)
      if (room && member?.socket === socket && rooms.has(room.id)) {
        member.socket = undefined
        member.absentAt = Date.now()
        publish(room)
      }
    })
  })

  function close() {
    clearInterval(timer)
    for (const client of ws.clients) client.terminate()
    ws.close()
    return new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }

  return { server, close }
}
