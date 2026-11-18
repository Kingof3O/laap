import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { type BillingEnv } from '../billing-worker.js'
import { decode, encode, hash } from './crypto.js'

const buyer = '11111111-1111-4111-8111-111111111111'
const env: BillingEnv = {
  BILLING_ORIGIN: 'https://billing.example.test', BILLING_OWNER_USER_ID: buyer, BILLING_SIGNING_KEY: '',
  SUPABASE_URL: 'https://billing-data.example.test', SUPABASE_ANON_KEY: 'test-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service', PADDLE_MODE: 'sandbox',
  PADDLE_API_KEY: 'test-api', PADDLE_CLIENT_TOKEN: 'test_checkout', PADDLE_WEBHOOK_SECRET: 'webhook-secret',
  PADDLE_MONTHLY_PRICE: 'pri_month', PADDLE_YEARLY_PRICE: 'pri_year', PADDLE_LIFETIME_PRICE: 'pri_lifetime',
}

function post(path: string, body: unknown, headers: Record<string, string> = {}, settings = env) {
  return worker.fetch(new Request(env.BILLING_ORIGIN + path, {
    method: 'POST', body: JSON.stringify(body),
    headers: { Authorization: 'Bearer billing.test.token.for.api', ...headers },
  }), settings)
}

function signedEvent(type: string, data: unknown, signedAt = Math.floor(Date.now() / 1000)) {
  const event = { event_type: type, event_id: 'evt_123', occurred_at: new Date().toISOString(), data }
  const mac = createHmac('sha256', env.PADDLE_WEBHOOK_SECRET).update(signedAt + ':' + JSON.stringify(event)).digest('hex')
  return { event, signature: 'ts=' + signedAt + ';h1=' + mac }
}

const user = { id: buyer, email: 'owner@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' }
const reply = (body: unknown) => Response.json(body)
async function keys() {
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
  if (!('privateKey' in pair)) throw new Error('Expected an Ed25519 key pair.')
  return pair
}
const utf8 = new TextEncoder()

afterEach(() => vi.unstubAllGlobals())

describe('billing Worker', () => {
  it.each([
    ['monthly', 'pri_month'], ['yearly', 'pri_year'], ['lifetime', 'pri_lifetime'],
  ])('opens the server-configured %s checkout for a verified buyer', async (plan, price) => {
    const remote = vi.fn(async (input: URL, init: RequestInit) => {
      const body = init.body ? JSON.parse(String(init.body)) : {}
      if (input.pathname === '/auth/v1/user') return reply(user)
      if (input.pathname.endsWith('_throttle')) return reply(true)
      if (input.pathname.endsWith('_prepare_checkout')) {
        expect(body).toEqual({ p_buyer: buyer, p_plan: plan })
        return reply({ id: buyer })
      }
      if (input.pathname.endsWith('_customer')) return reply(null)
      if (input.pathname === '/transactions') {
        expect(input.hostname).toBe('sandbox-api.paddle.com')
        expect(body.items).toEqual([{ price_id: price, quantity: 1 }])
        return reply({ data: { id: 'txn_123', checkout: { url: env.BILLING_ORIGIN + '/checkout?_ptxn=txn_123' } } })
      }
      if (input.pathname.endsWith('_finish_checkout')) {
        expect(body.p_transaction).toBe('txn_123')
        return reply(true)
      }
      throw new Error(input.pathname)
    })
    vi.stubGlobal('fetch', remote)
    const response = await post('/v1/checkout', { plan, price: 'pri_forged' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ url: env.BILLING_ORIGIN + '/checkout?_ptxn=txn_123' })
    const disabled = await post('/v1/checkout', { plan }, {}, { ...env, PADDLE_MODE: 'live' })
    expect(disabled.status).toBe(503)
  })

  it.each([
    ['monthly', 'pri_month'], ['yearly', 'pri_year'], ['lifetime', 'pri_lifetime'],
  ])('uses signed, exactly matched %s payments to record grants', async (plan, price) => {
    const remote = vi.fn(async (input: URL, init: RequestInit) => {
      expect(input.pathname).toBe('/rest/v1/rpc/laap_billing_payment')
      expect(JSON.parse(String(init.body))).toMatchObject({
        p_event: 'evt_123', p_transaction: 'txn_123', p_customer: 'ctm_123', p_plan: plan,
        p_subscription: plan === 'lifetime' ? null : 'sub_123',
        p_ends: plan === 'lifetime' ? null : '2026-12-01T00:00:00Z',
      })
      return reply(true)
    })
    vi.stubGlobal('fetch', remote)
    const data = {
      id: 'txn_123', status: 'completed', customer_id: 'ctm_123', subscription_id: 'sub_123',
      billing_period: { starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-12-01T00:00:00Z' },
      items: [{ price: { id: price }, quantity: 1 }],
      payments: [{ status: 'captured', amount: '300' }],
    }
    const { event, signature } = signedEvent('transaction.completed', data)
    const tampered = await post('/v1/webhook/paddle', { ...event, data: { ...data, customer_id: 'ctm_999' } }, { 'Paddle-Signature': signature })
    expect(tampered.status).toBe(401)
    const stale = signedEvent('transaction.completed', data, Math.floor(Date.now() / 1000) - 300)
    expect((await post('/v1/webhook/paddle', stale.event, { 'Paddle-Signature': stale.signature })).status).toBe(401)
    const noCharge = signedEvent('transaction.completed', { ...data, payments: [] })
    expect((await post('/v1/webhook/paddle', noCharge.event, { 'Paddle-Signature': noCharge.signature })).status).toBe(200)
    expect(remote).not.toHaveBeenCalled()
    expect((await post('/v1/webhook/paddle', event, { 'Paddle-Signature': signature })).status).toBe(200)
    expect(remote).toHaveBeenCalledTimes(1)
  })

  it('records refunds for unprocessed transactions and ignores failed renewals', async () => {
    const remote = vi.fn(async (input: URL, init: RequestInit) => {
      expect(input.pathname.endsWith('_adjustment')).toBe(true)
      expect(JSON.parse(String(init.body))).toMatchObject({
        p_transaction: 'txn_123', p_action: 'refund', p_status: 'approved', p_full: true,
      })
      return reply(true)
    })
    vi.stubGlobal('fetch', remote)
    const failed = signedEvent('transaction.payment_failed', { id: 'txn_123' })
    expect((await post('/v1/webhook/paddle', failed.event, { 'Paddle-Signature': failed.signature })).status).toBe(200)
    expect(remote).not.toHaveBeenCalled()
    const refund = signedEvent('adjustment.updated', { id: 'adj_123', transaction_id: 'txn_123', action: 'refund', status: 'approved', type: 'full' })
    expect((await post('/v1/webhook/paddle', refund.event, { 'Paddle-Signature': refund.signature })).status).toBe(200)
    expect(remote).toHaveBeenCalledTimes(1)
  })

  it('requires one-use signed device proof and signs the actual paid expiry', async () => {
    const device = await keys()
    const signer = await keys()
    const deviceKey = encode(new Uint8Array(await crypto.subtle.exportKey('raw', device.publicKey)))
    const settings = { ...env, BILLING_SIGNING_KEY: encode(new Uint8Array(await crypto.subtle.exportKey('pkcs8', signer.privateKey))) }
    const end = Math.floor(Date.now() / 1000) + 900
    const stored = new Set<string>()
    vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit) => {
      const data = JSON.parse(String(init.body))
      if (input.pathname.endsWith('_throttle')) return reply(true)
      if (input.pathname.endsWith('_use_challenge')) return reply(stored.delete(data.p_hash))
      if (input.pathname.endsWith('_challenge')) { stored.add(data.p_hash); return new Response(null, { status: 204 }) }
      if (input.pathname.endsWith('_refresh')) return reply({ grantId: 'p:txn_123', end })
      throw new Error(input.pathname)
    }))
    const challengeResponse = await post('/v1/device/challenge', { deviceKey, action: 'refresh' }, {}, settings)
    const { challenge } = await challengeResponse.json() as { challenge: string }
    const proof = encode(new Uint8Array(await crypto.subtle.sign('Ed25519', device.privateKey, utf8.encode('laap-device-v1:refresh:' + challenge))))
    const request = { deviceKey, challenge, proof }
    expect((await post('/v1/device/refresh', { ...request, proof: 'A'.repeat(86) }, {}, settings)).status).toBe(403)
    const response = await post('/v1/device/refresh', request, {}, settings)
    expect(response.status).toBe(200)
    const { license } = await response.json() as { license: string }
    const [payload, signature] = license.split('.').map(decode)
    expect(await crypto.subtle.verify('Ed25519', signer.publicKey, signature, payload)).toBe(true)
    expect(JSON.parse(new TextDecoder().decode(payload))).toMatchObject({ deviceKey, exp: end, state: 'pro' })
    expect((await post('/v1/device/refresh', request, {}, settings)).status).toBe(403)
  })

  it('returns a gift code only to its owner and persists only its hash', async () => {
    let savedHash = ''
    const remote = vi.fn(async (input: URL, init: RequestInit) => {
      if (input.pathname.endsWith('_throttle')) return reply(true)
      if (input.pathname.endsWith('/user')) return reply(user)
      expect(input.pathname.endsWith('_create_gift')).toBe(true)
      const data = JSON.parse(String(init.body))
      savedHash = data.p_hash
      expect(Object.keys(data).sort()).toEqual(['p_duration', 'p_email', 'p_hash', 'p_owner'])
      return reply({ id: buyer, redeemBy: '2026-12-01' })
    })
    vi.stubGlobal('fetch', remote)
    expect((await post('/v1/owner/create', { duration: 'lifetime' }, {}, { ...env, BILLING_OWNER_USER_ID: undefined })).status).toBe(403)
    const response = await post('/v1/owner/create', { duration: 'lifetime' })
    expect(response.status).toBe(200)
    const { code } = await response.json() as { code: string }
    expect(code).toMatch(/^LAAP-[A-Za-z0-9_-]{32}$/)
    expect(savedHash).toBe(await hash(code))
  })
})
