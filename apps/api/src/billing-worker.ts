import { decode, encode, hash, randomCode, signLease, verifyDevice, verifyPaddle } from './billing/crypto.js'
import { checkoutPage, giftPage } from './billing/pages.js'

export interface BillingEnv {
  BILLING_ORIGIN: string
  BILLING_OWNER_USER_ID?: string
  BILLING_LIVE_ENABLED?: string
  BILLING_SIGNING_KEY: string
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  PADDLE_MODE: 'sandbox' | 'live'
  PADDLE_API_KEY: string
  PADDLE_CLIENT_TOKEN: string
  PADDLE_WEBHOOK_SECRET: string
  PADDLE_MONTHLY_PRICE: string
  PADDLE_YEARLY_PRICE: string
  PADDLE_LIFETIME_PRICE: string
}

type Data = Record<string, unknown>
type Plan = 'monthly' | 'yearly' | 'lifetime'
type Grant = { grantId?: string; end?: number | null; error?: string }
type Purchaser = { id: string; email: string }
type Checkout = { id: string; error?: string; transactionId?: string; plan?: string; url?: string }

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
} })
const time = () => Math.floor(Date.now() / 1000)
const deviceActions = ['activate', 'refresh', 'transfer', 'redeem']
const uid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

class Failure extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

function record(value: unknown): Data {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {}
}

function string(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function matches(value: unknown, pattern: RegExp, description: string) {
  const text = string(value)
  if (!pattern.test(text)) throw new Failure(400, description)
  return text
}

function email(value: unknown) {
  return matches(string(value).trim().toLowerCase(), /^[^\s@]{1,120}@[^\s@]{1,120}\.[^\s@]{1,40}$/, 'Enter a valid email address.')
}

async function readBody(request: Request, limit: number) {
  const body = new Uint8Array(limit)
  const reader = request.body?.getReader()
  let length = 0
  if (reader) {
    try {
      for (;;) {
        const next = await reader.read()
        if (next.done) break
        if (length + next.value.length > limit) {
          await reader.cancel()
          throw new Failure(413, 'Request is too large.')
        }
        body.set(next.value, length)
        length += next.value.length
      }
    } finally {
      reader.releaseLock()
    }
  }
  return body.subarray(0, length)
}

function parse(raw: Uint8Array) {
  try { return record(JSON.parse(new TextDecoder().decode(raw))) }
  catch { throw new Failure(400, 'Invalid request body.') }
}

async function rpc<T>(env: BillingEnv, name: string, data: Data): Promise<T> {
  const response = await fetch(new URL('/rest/v1/rpc/laap_billing_' + name, env.SUPABASE_URL), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(3500),
    headers: {
      'Content-Type': 'application/json', apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    console.error('LAAP billing database request failed', name, response.status)
    throw new Failure(503, 'Billing is temporarily unavailable. Try again shortly.')
  }
  const body = await response.text()
  return (body ? JSON.parse(body) : null) as T
}

async function auth(env: BillingEnv, path: string, body?: Data, token?: string) {
  return fetch(new URL('/auth/v1/' + path, env.SUPABASE_URL), {
    method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function verifiedUser(value: unknown): Purchaser {
  const user = record(value)
  if (!uid.test(string(user.id)) || !user.email || !user.email_confirmed_at) {
    throw new Failure(401, 'Verify your billing email to continue.')
  }
  return { id: string(user.id), email: email(user.email) }
}

async function purchaser(request: Request, env: BillingEnv) {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_.-]{20,5000})$/)?.[1]
  if (!token) throw new Failure(401, 'Verify your billing email to continue.')
  const response = await auth(env, 'user', undefined, token)
  if (response.status >= 500) throw new Failure(503, 'Email verification is temporarily unavailable.')
  if (!response.ok) throw new Failure(401, 'Verify your billing email to continue.')
  return verifiedUser(await response.json())
}

async function verifyOtp(env: BillingEnv, data: Data) {
  const address = email(data.email)
  const token = matches(data.code, /^\d{6,10}$/, 'Enter the code from your email.')
  await throttle(env, 'verify:' + await hash(address), 10, 900)
  const response = await auth(env, 'verify', { type: 'email', email: address, token })
  if (response.status >= 500) throw new Failure(503, 'Email verification is temporarily unavailable.')
  if (!response.ok) throw new Failure(400, 'The email code is invalid or has expired.')
  const verified = record(await response.json())
  return { user: verifiedUser(verified.user), accessToken: string(verified.access_token) }
}

async function throttle(env: BillingEnv, key: string, limit: number, seconds: number) {
  if (!await rpc<boolean>(env, 'throttle', { p_key: key, p_limit: limit, p_seconds: seconds })) {
    throw new Failure(429, 'Too many attempts. Try again later.')
  }
}

function plans(env: BillingEnv): Record<Plan, string> {
  return { monthly: env.PADDLE_MONTHLY_PRICE, yearly: env.PADDLE_YEARLY_PRICE, lifetime: env.PADDLE_LIFETIME_PRICE }
}

function checkoutEnabled(env: BillingEnv) {
  return env.PADDLE_MODE === 'sandbox' || (env.PADDLE_MODE === 'live' && env.BILLING_LIVE_ENABLED === 'true')
}

function checkoutToken(env: BillingEnv) {
  const pattern = env.PADDLE_MODE === 'sandbox' ? /^test_[A-Za-z0-9_]+$/ : /^live_[A-Za-z0-9_]+$/
  if (!checkoutEnabled(env) || !pattern.test(env.PADDLE_CLIENT_TOKEN)) {
    throw new Failure(503, 'Checkout is not available.')
  }
  return env.PADDLE_CLIENT_TOKEN
}

async function paddle(env: BillingEnv, path: string, body?: Data, method = body ? 'POST' : 'GET') {
  if (!['sandbox', 'live'].includes(env.PADDLE_MODE)) throw new Failure(503, 'Billing is not configured.')
  const origin = env.PADDLE_MODE === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com'
  const response = await fetch(new URL(path, origin), {
    method, redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { Authorization: 'Bearer ' + env.PADDLE_API_KEY, 'Content-Type': 'application/json', 'Paddle-Version': '1' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    console.error('Paddle billing request failed', method, response.status)
    throw new Failure(503, 'Paddle could not complete this request. Try again shortly.')
  }
  return record(record(await response.json()).data)
}

function checkoutUrl(value: unknown, env: BillingEnv, transaction: string) {
  const url = new URL(string(value))
  if (url.protocol !== 'https:' || url.username || url.password || url.origin !== new URL(env.BILLING_ORIGIN).origin
    || url.pathname !== '/checkout' || url.searchParams.get('_ptxn') !== transaction) {
    throw new Failure(503, 'The approved checkout page is not configured.')
  }
  return url.href
}

async function checkout(env: BillingEnv, user: Purchaser, data: Data) {
  checkoutToken(env)
  const plan = matches(data.plan, /^(monthly|yearly|lifetime)$/, 'Choose a supported plan.') as Plan
  const price = matches(plans(env)[plan], /^pri_[a-z0-9]+$/, 'The selected plan is unavailable.')
  for (let attempt = 0; attempt < 2; attempt++) {
    const pending = await rpc<Checkout>(env, 'prepare_checkout', { p_buyer: user.id, p_plan: plan })
    if (pending.error) throw new Failure(409, pending.error)
    if (pending.transactionId) {
      const transaction = await paddle(env, '/transactions/' + pending.transactionId)
      if (transaction.status === 'completed' || transaction.status === 'paid') {
        throw new Failure(409, 'Your payment is being verified. Return to LAAP and select Activate Pro.')
      }
      if (transaction.status !== 'canceled' && pending.plan === plan) {
        return { url: checkoutUrl(pending.url, env, pending.transactionId) }
      }
      if (transaction.status !== 'canceled') {
        await paddle(env, '/transactions/' + pending.transactionId, { status: 'canceled' }, 'PATCH')
      }
      await rpc(env, 'finish_checkout', { p_id: pending.id, p_transaction: null, p_url: null, p_close: true })
      continue
    }
    try {
      const customer = await rpc<string | null>(env, 'customer', { p_buyer: user.id })
      const result = await paddle(env, '/transactions', {
        items: [{ price_id: price, quantity: 1 }], collection_mode: 'automatic',
        ...(customer ? { customer_id: customer } : {}),
        checkout: { url: new URL('/checkout', env.BILLING_ORIGIN).href },
      })
      const transaction = matches(result.id, /^txn_[a-z0-9]+$/, 'Missing Paddle transaction.')
      const url = checkoutUrl(record(result.checkout).url, env, transaction)
      if (!await rpc<boolean>(env, 'finish_checkout', { p_id: pending.id, p_transaction: transaction, p_url: url, p_close: false })) {
        throw new Failure(503, 'Checkout could not be saved. Try again shortly.')
      }
      return { url }
    } catch (cause) {
      await rpc(env, 'finish_checkout', { p_id: pending.id, p_transaction: null, p_url: null, p_close: true }).catch(() => {})
      throw cause
    }
  }
  throw new Failure(409, 'Checkout changed. Try again.')
}

async function portal(env: BillingEnv, user: Purchaser) {
  const customer = await rpc<string | null>(env, 'customer', { p_buyer: user.id })
  if (!customer) throw new Failure(404, 'There are no Paddle purchases for this billing account.')
  const id = matches(customer, /^ctm_[a-z0-9]+$/, 'Invalid Paddle customer.')
  const session = await paddle(env, '/customers/' + id + '/portal-sessions', {})
  const url = new URL(string(record(record(session.urls).general).overview))
  if (url.protocol !== 'https:' || !['customer-portal.paddle.com', 'sandbox-customer-portal.paddle.com'].includes(url.hostname)
    || url.username || url.password || url.port) throw new Failure(503, 'Invalid Paddle billing portal link.')
  return { url: url.href }
}

async function cancelCheckout(env: BillingEnv, user: Purchaser) {
  const pending = await rpc<Checkout | null>(env, 'pending_checkout', { p_buyer: user.id })
  if (!pending) return { ok: true }
  if (!pending.transactionId) throw new Failure(409, 'Checkout is still being prepared. Try again shortly.')
  const transaction = await paddle(env, '/transactions/' + pending.transactionId)
  if (transaction.status === 'paid' || transaction.status === 'completed') {
    throw new Failure(409, 'This checkout has been paid. Select Activate Pro to check your license.')
  }
  if (transaction.status !== 'canceled') {
    await paddle(env, '/transactions/' + pending.transactionId, { status: 'canceled' }, 'PATCH')
  }
  await rpc(env, 'finish_checkout', { p_id: pending.id, p_transaction: null, p_url: null, p_close: true })
  return { ok: true }
}

async function webhook(request: Request, env: BillingEnv) {
  const raw = await readBody(request, 256 * 1024)
  if (!await verifyPaddle(raw, request.headers.get('Paddle-Signature'), env.PADDLE_WEBHOOK_SECRET, time())) {
    throw new Failure(401, 'Invalid Paddle webhook signature.')
  }
  const event = parse(raw)
  const data = record(event.data)
  const id = matches(event.event_id, /^evt_[a-z0-9]+$/, 'Invalid Paddle event.')
  switch (event.event_type) {
    case 'transaction.completed': {
      if (data.status !== 'completed') throw new Failure(400, 'Paddle transaction is incomplete.')
      const items = Array.isArray(data.items) ? data.items.map(record) : []
      const plan = (Object.entries(plans(env)) as [Plan, string][])
        .find(([, price]) => price && items.some((item) => record(item.price).id === price))?.[0]
      if (!plan) break
      if (items.length !== 1 || items[0].quantity !== 1) throw new Failure(400, 'Unexpected LAAP transaction items.')
      const payments = Array.isArray(data.payments) ? data.payments.map(record) : []
      if (!payments.some((payment) => payment.status === 'captured' && /^[1-9][0-9]*$/.test(string(payment.amount)))) {
        console.warn('LAAP billing ignored a completed transaction without a captured payment', id)
        break
      }
      const term = record(data.billing_period)
      const starts = plan === 'lifetime' ? string(data.billed_at || event.occurred_at) : string(term.starts_at)
      const ends = plan === 'lifetime' ? null : string(term.ends_at)
      const subscription = plan === 'lifetime' ? null : matches(data.subscription_id, /^sub_[a-z0-9]+$/, 'Missing Paddle subscription.')
      if (!Number.isFinite(Date.parse(starts)) || (ends !== null && !(Date.parse(ends) > Date.parse(starts)))) {
        throw new Failure(503, 'Waiting for the Paddle billing period.')
      }
      const processed = await rpc<boolean>(env, 'payment', {
        p_event: id, p_transaction: matches(data.id, /^txn_[a-z0-9]+$/, 'Invalid Paddle transaction.'),
        p_customer: matches(data.customer_id, /^ctm_[a-z0-9]+$/, 'Invalid Paddle customer.'),
        p_subscription: subscription, p_plan: plan, p_starts: starts, p_ends: ends,
      })
      if (!processed) {
        console.warn('LAAP billing payment is waiting for checkout attribution', id)
        throw new Failure(503, 'The matching checkout has not been recorded yet.')
      }
      break
    }
    case 'adjustment.created':
    case 'adjustment.updated':
      if (!['refund', 'chargeback', 'chargeback_reverse'].includes(string(data.action))) break
      await rpc(env, 'adjustment', {
        p_event: id, p_id: matches(data.id, /^adj_[a-z0-9]+$/, 'Invalid Paddle adjustment.'),
        p_transaction: matches(data.transaction_id, /^txn_[a-z0-9]+$/, 'Invalid Paddle transaction.'),
        p_occurred: event.occurred_at, p_action: data.action, p_status: data.status, p_full: data.type === 'full',
      })
      break
  }
  return json({ ok: true })
}

function publicDevice(data: Data) {
  const key = matches(data.deviceKey, /^[A-Za-z0-9_-]{43}$/, 'Invalid device key.')
  const bytes = decode(key)
  if (bytes.length !== 32 || encode(bytes) !== key) throw new Failure(400, 'Invalid device key.')
  return key
}

async function deviceRequest(request: Request, env: BillingEnv, action: string, data: Data) {
  const device = publicDevice(data)
  if (action === 'challenge') {
    const purpose = string(data.action)
    if (!deviceActions.includes(purpose)) throw new Failure(400, 'Unknown device request.')
    const challenge = randomCode(32)
    await rpc(env, 'challenge', { p_hash: await hash(challenge), p_device: device, p_action: purpose })
    return { challenge }
  }
  if (!deviceActions.includes(action)) throw new Failure(404, 'Unknown device request.')
  const challenge = matches(data.challenge, /^[A-Za-z0-9_-]{43}$/, 'Invalid device challenge.')
  const proof = matches(data.proof, /^[A-Za-z0-9_-]{86}$/, 'Invalid device proof.')
  if (!await verifyDevice(device, proof, action, challenge) ||
      !await rpc<boolean>(env, 'use_challenge', { p_hash: await hash(challenge), p_device: device, p_action: action })) {
    throw new Failure(403, 'Device verification expired or failed. Try again.')
  }
  let grant: Grant
  if (action === 'refresh') {
    grant = await rpc<Grant>(env, 'refresh', { p_device: device })
  } else {
    const user = await purchaser(request, env)
    if (action === 'transfer') {
      const fresh = await verifyOtp(env, data)
      if (fresh.user.id !== user.id) throw new Failure(403, 'Use the email for your verified billing account.')
    }
    if (action === 'redeem') {
      await throttle(env, 'redeem:' + user.id, 8, 900)
      const code = matches(string(data.code).trim(), /^LAAP-[A-Za-z0-9_-]{32}$/, 'Enter a valid LAAP gift code.')
      grant = await rpc<Grant>(env, 'redeem', { p_buyer: user.id, p_email: user.email, p_hash: await hash(code) })
      if (grant.error) throw new Failure(409, grant.error)
      if (!grant.grantId) throw new Failure(409, 'This gift is no longer active.')
    }
    grant = await rpc<Grant>(env, 'activate', { p_buyer: user.id, p_device: device, p_transfer: action === 'transfer' })
    if (grant.error) throw new Failure(409, (action === 'redeem' ? 'Gift redeemed. ' : '') + grant.error)
    if (!grant.grantId) throw new Failure(409, 'No active Pro license yet. If you just paid, try again shortly.')
  }
  return { license: await signLease(env.BILLING_SIGNING_KEY, device, grant, time()) }
}

async function ownerRequest(request: Request, env: BillingEnv, action: string, data: Data) {
  const owner = await purchaser(request, env)
  if (owner.id !== env.BILLING_OWNER_USER_ID) throw new Failure(403, 'Owner access is required.')
  switch (action) {
    case 'gifts': return rpc(env, 'gifts', { p_owner: owner.id })
    case 'create': {
      const duration = matches(data.duration, /^(month|year|lifetime)$/, 'Choose a gift duration.')
      const recipient = string(data.recipient).trim() ? email(data.recipient) : null
      const code = 'LAAP-' + randomCode(24)
      const gift = await rpc<Data>(env, 'create_gift', { p_owner: owner.id, p_hash: await hash(code),
        p_duration: duration, p_email: recipient })
      return { ...gift, code }
    }
    case 'revoke': {
      const id = matches(data.id, uid, 'Invalid gift.')
      if (!await rpc(env, 'revoke_gift', { p_owner: owner.id, p_id: id })) throw new Failure(404, 'The gift is unavailable.')
      return { ok: true }
    }
    case 'transfer-override': {
      const reason = string(data.reason).trim()
      if (!reason || reason.length > 200) throw new Failure(400, 'Enter a support reason up to 200 characters.')
      if (!await rpc(env, 'transfer_override', { p_email: email(data.buyer), p_owner: owner.id, p_reason: reason })) {
        throw new Failure(404, 'Verified billing account not found.')
      }
      return { ok: true }
    }
    default: throw new Failure(404, 'Unknown billing request.')
  }
}

export default {
  async fetch(request: Request, env: BillingEnv) {
    const path = new URL(request.url).pathname
    try {
      if (request.method === 'GET') {
        if (path === '/health') return json({ ok: true })
        if (path === '/checkout') return checkoutPage(env.PADDLE_MODE === 'sandbox', checkoutToken(env))
        if (path === '/gifts') return giftPage()
      }
      if (request.method !== 'POST' || !path.startsWith('/v1/')) throw new Failure(404, 'Unknown billing request.')
      if (path === '/v1/webhook/paddle') return await webhook(request, env)
      await throttle(env, 'ip:' + await hash(request.headers.get('CF-Connecting-IP') ?? 'local'), 180, 60)
      const data = parse(await readBody(request, 8192))
      switch (path) {
        case '/v1/auth/code': {
          const address = email(data.email)
          await throttle(env, 'otp:' + await hash(address), 4, 900)
          const response = await auth(env, 'otp', { email: address, create_user: true })
          if (!response.ok) throw new Failure(response.status === 429 ? 429 : 503, 'Could not send a code. Try again later.')
          return json({ ok: true })
        }
        case '/v1/auth/verify': return json({ accessToken: (await verifyOtp(env, data)).accessToken })
        case '/v1/checkout': return json(await checkout(env, await purchaser(request, env), data))
        case '/v1/checkout/cancel': return json(await cancelCheckout(env, await purchaser(request, env)))
        case '/v1/portal': return json(await portal(env, await purchaser(request, env)))
      }
      if (path.startsWith('/v1/device/')) return json(await deviceRequest(request, env, path.slice(11), data))
      if (path.startsWith('/v1/owner/')) return json(await ownerRequest(request, env, path.slice(10), data))
      throw new Failure(404, 'Unknown billing request.')
    } catch (cause) {
      if (cause instanceof Failure) return json({ error: cause.message }, cause.status)
      console.error('Unhandled LAAP billing error', path, cause instanceof Error ? cause.name : 'unknown')
      return json({ error: 'Billing is temporarily unavailable. Try again shortly.' }, 503)
    }
  },
  async scheduled(_event: unknown, env: BillingEnv) { await rpc(env, 'cleanup', {}) },
}
