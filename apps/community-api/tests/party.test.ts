import { once } from 'node:events'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import WebSocket from 'ws'
import { createCommunityServer } from '../src/party.ts'

type WireEvent = {
  type: string
  room: string
  invite: string
  token: string
  self: string
  owner: string
  seq: number
  text?: string
  members: Array<{ id: string; connected: boolean; selection: number | null }>
}

const origin = 'http://tauri.localhost'

function peer(url: string, header = origin) {
  const socket = new WebSocket(url, { origin: header })
  const inbox: WireEvent[] = []
  socket.on('message', (message) => inbox.push(JSON.parse(message.toString()) as WireEvent))
  async function next(type: string, predicate: (event: WireEvent) => boolean = () => true) {
    const deadline = Date.now() + 2_000
    while (Date.now() < deadline) {
      const index = inbox.findIndex((event) => event.type === type && predicate(event))
      if (index >= 0) return inbox.splice(index, 1)[0]!
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error('Timed out waiting for ' + type)
  }
  return { socket, next, send: (value: unknown) => socket.send(JSON.stringify(value)) }
}

test('real WebSockets sync a room, reject unknown payload fields, and restore membership', async () => {
  const relay = createCommunityServer({ origins: new Set([origin]) })
  relay.server.listen(0, '127.0.0.1')
  await once(relay.server, 'listening')
  const address = relay.server.address()
  assert(address && typeof address !== 'string')
  const url = 'ws://127.0.0.1:' + address.port + '/v1/rooms/events'
  try {
    const blocked = peer(url, 'https://untrusted.example')
    const [failure] = await once(blocked.socket, 'error')
    assert.match(failure.message, /403/)

    const host = peer(url)
    await once(host.socket, 'open')
    host.send({ type: 'create' })
    await host.next('membership')
    const created = await host.next('snapshot')
    assert.equal(created.self, created.owner)
    const guest = peer(url)
    await once(guest.socket, 'open')
    guest.send({ type: 'join', invite: created.invite, sessionBlob: 'test must be rejected' })
    await guest.next('error')
    guest.send({ type: 'join', invite: created.invite })
    const credentials = await guest.next('membership')
    const joined = await guest.next('snapshot')
    assert.equal(joined.members.length, 2)
    assert.equal(joined.owner, created.self)

    guest.send({ type: 'select', skinId: 103001 })
    const changed = await host.next('snapshot', (state) => state.members.some((member) => member.selection === 103001))
    assert(changed.seq > joined.seq)
    guest.socket.terminate()
    await host.next('snapshot', (state) => state.members.some((member) => member.id === joined.self && !member.connected))

    const resumed = peer(url)
    await once(resumed.socket, 'open')
    resumed.send({ type: 'resume', room: credentials.room, token: credentials.token })
    await resumed.next('membership')
    const restored = await resumed.next('snapshot')
    assert.equal(restored.self, joined.self)
    assert.equal(restored.members.length, 2)
    assert(restored.members.some((member) => member.selection === 103001 && member.connected))

    host.send({ type: 'rotate' })
    const rotated = await resumed.next('snapshot', (state) => state.invite !== created.invite)
    assert.notEqual(rotated.invite, created.invite)
    host.send({ type: 'leave' })
    const transferred = await resumed.next('snapshot', (state) => state.owner === restored.self)
    assert.equal(transferred.members.length, 1)
  } finally {
    await relay.close()
  }
})


test('seven peers share bounded metadata and chat requires separate consent', async () => {
  const relay = createCommunityServer({ origins: new Set([origin]) })
  relay.server.listen(0, '127.0.0.1')
  await once(relay.server, 'listening')
  const address = relay.server.address()
  assert(address && typeof address !== 'string')
  const url = 'ws://127.0.0.1:' + address.port + '/v1/rooms/events'
  try {
    const host = peer(url)
    await once(host.socket, 'open')
    host.send({ type: 'create' })
    await host.next('membership')
    const created = await host.next('snapshot')
    const members = []
    for (let i = 0; i < 6; i++) {
      const guest = peer(url)
      await once(guest.socket, 'open')
      guest.send({ type: 'join', invite: created.invite })
      await guest.next('membership')
      const snapshot = await guest.next('snapshot')
      members.push({ ...guest, self: snapshot.self })
    }
    const full = await host.next('snapshot', (snapshot) => snapshot.members.length === 7)
    assert.equal(full.members.length, 7)
    const guest = members[0]!
    guest.send({ type: 'chat', text: 'Requires consent' })
    await guest.next('error')
    host.send({ type: 'chatConsent', enabled: true })
    guest.send({ type: 'chatConsent', enabled: true })
    guest.send({ type: 'chat', text: 'Hello from the test room' })
    const message = await host.next('chat')
    assert.equal(message.text, 'Hello from the test room')
    host.send({ type: 'kick', memberId: guest.self })
    const remaining = await host.next('snapshot', (snapshot) => snapshot.seq > full.seq && snapshot.members.length === 6)
    assert(!remaining.members.some((member) => member.id === guest.self))
  } finally {
    await relay.close()
  }
})
