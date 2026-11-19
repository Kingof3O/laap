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

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-laap-pages-proxy',
}

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...corsHeaders,
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
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(3500),
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
    method: body ? 'POST' : 'GET', redirect: 'manual', signal: AbortSignal.timeout(10_000),
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

async function paddleResponse(env: BillingEnv, path: string, body?: Data, method = body ? 'POST' : 'GET') {
  if (!['sandbox', 'live'].includes(env.PADDLE_MODE)) throw new Failure(503, 'Billing is not configured.')
  const origin = env.PADDLE_MODE === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com'
  const response = await fetch(new URL(path, origin), {
    method, redirect: 'manual', signal: AbortSignal.timeout(10_000),
    headers: { Authorization: 'Bearer ' + env.PADDLE_API_KEY, 'Content-Type': 'application/json', 'Paddle-Version': '1' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    console.error('Paddle billing request failed', method, response.status, errText)
    throw new Failure(503, 'Paddle could not complete this request. Try again shortly.')
  }
  return record(await response.json())
}

async function paddle(env: BillingEnv, path: string, body?: Data, method?: string) {
  return record((await paddleResponse(env, path, body, method)).data)
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
  await applyPaddleEvent(env, parse(raw))
  return json({ ok: true })
}

async function recordPayment(env: BillingEnv, data: Data, transaction: string, id: string, occurred: unknown, authoritative = false) {
  const configuredPrices = Object.values(plans(env))
  if (new Set(configuredPrices).size !== 3 || configuredPrices.some((price) => !/^pri_[a-z0-9]+$/.test(price))) {
    throw new Failure(503, 'Paddle prices are not configured.')
  }
  const items = Array.isArray(data.items) ? data.items.map(record) : []
  const planFor = (priceId: unknown) => (Object.entries(plans(env)) as [Plan, string][])
    .find(([, price]) => price === priceId)?.[0]
  if (items.length > 0 && !items.some((item) => planFor(record(item.price).id))) {
    if (authoritative) await rpc(env, 'no_charge', { p_transaction: transaction, p_close_checkout: false })
    return true
  }
  if (data.status !== 'completed') return false
  const payments = Array.isArray(data.payments) ? data.payments.map(record) : []
  if (!payments.some((payment) => payment.status === 'captured' && /^[1-9][0-9]*$/.test(string(payment.amount)))) {
    if (authoritative && record(record(data.details).totals).grand_total === '0') {
      await rpc(env, 'no_charge', { p_transaction: transaction, p_close_checkout: true })
      return true
    }
    return false
  }
  let plan = planFor(record(items[0]?.price).id)
  let term = record(data.billing_period)
  if (data.origin === 'subscription_update') {
    const details = record(data.details)
    const lines = Array.isArray(details.line_items) ? details.line_items.map(record) : []
    const charged = lines.filter((line) => /^[1-9][0-9]*$/.test(string(record(line.totals).total)))
    const changedPlan = planFor(charged[0]?.price_id)
    if (charged.length !== 1 || charged[0].quantity !== 1 || !changedPlan || changedPlan === 'lifetime') return false
    plan = changedPlan
    if (!term.starts_at || !term.ends_at) term = record(record(charged[0].proration).billing_period)
  } else if (items.length !== 1 || items[0].quantity !== 1) {
    return false
  }
  if (!plan) return false
  const starts = plan === 'lifetime' ? string(data.billed_at || occurred) : string(term.starts_at)
  const ends = plan === 'lifetime' ? null : string(term.ends_at)
  const subscription = plan === 'lifetime' ? null : string(data.subscription_id)
  const customer = string(data.customer_id)
  if (!/^ctm_[a-z0-9]+$/.test(customer) || (subscription !== null && !/^sub_[a-z0-9]+$/.test(subscription))
    || !Number.isFinite(Date.parse(starts)) || (ends !== null && !(Date.parse(ends) > Date.parse(starts)))) return false
  return rpc<boolean>(env, 'payment', {
    p_event: id, p_transaction: transaction, p_customer: customer,
    p_subscription: subscription, p_plan: plan, p_starts: starts, p_ends: ends,
  })
}

async function applyPaddleEvent(env: BillingEnv, event: Data) {
  const data = record(event.data)
  const id = matches(event.event_id, /^evt_[a-z0-9]+$/, 'Invalid Paddle event.')
  switch (event.event_type) {
    case 'transaction.completed': {
      const transaction = matches(data.id, /^txn_[a-z0-9]+$/, 'Invalid Paddle transaction.')
      if (!await recordPayment(env, data, transaction, id, event.occurred_at)) {
        await rpc(env, 'queue_payment', { p_transaction: transaction })
      }
      break
    }
    case 'adjustment.created':
    case 'adjustment.updated': {
      if (!['refund', 'chargeback', 'chargeback_reverse'].includes(string(data.action))) break
      const transaction = matches(data.transaction_id, /^txn_[a-z0-9]+$/, 'Invalid Paddle transaction.')
      let fullRefund = data.type === 'full'
      if (data.action === 'refund' && data.status === 'approved' && !fullRefund) {
        const refund = record(data.totals)
        const amount = string(refund.total)
        if (/^[1-9][0-9]*$/.test(amount)) {
          const original = await paddle(env, '/transactions/' + transaction)
          const totals = record(record(original.details).totals)
          const paid = string(totals.grand_total)
          if (original.id !== transaction || !/^[1-9][0-9]*$/.test(paid) ||
              !refund.currency_code || refund.currency_code !== totals.currency_code) {
            throw new Failure(503, 'Could not verify Paddle refund amount.')
          }
          fullRefund = BigInt(amount) >= BigInt(paid)
        }
      }
      await rpc(env, 'adjustment', {
        p_event: id, p_id: matches(data.id, /^adj_[a-z0-9]+$/, 'Invalid Paddle adjustment.'),
        p_transaction: transaction, p_occurred: event.occurred_at,
        p_action: data.action, p_status: data.status, p_full: fullRefund,
      })
      break
    }
  }
}

async function reconcileEvents(env: BillingEnv) {
  const cursor = await rpc<string | null>(env, 'event_cursor', {})
  const query = new URLSearchParams({
    event_type: 'transaction.completed,adjustment.created,adjustment.updated', order_by: 'id[ASC]', per_page: '10',
  })
  if (cursor) query.set('after', cursor)
  const page = (await paddleResponse(env, '/events?' + query)).data
  if (!Array.isArray(page)) throw new Error('Paddle returned an invalid event page.')
  for (const event of page) await applyPaddleEvent(env, record(event))
  if (page.length > 0) {
    const last = matches(record(page[page.length - 1]).event_id, /^evt_[a-z0-9]+$/, 'Invalid Paddle cursor.')
    await rpc(env, 'event_cursor', { p_event: last })
  }
}

async function reconcilePayments(env: BillingEnv) {
  const pending = await rpc<string[]>(env, 'claim_payments', {})
  const outcomes = await Promise.allSettled(pending.map(async (id) => {
    const transaction = matches(id, /^txn_[a-z0-9]+$/, 'Invalid pending transaction.')
    const data = await paddle(env, '/transactions/' + transaction)
    if (data.id !== transaction) throw new Error('Paddle returned a different transaction.')
    if (!await recordPayment(env, data, transaction, 'reconcile:' + transaction, data.updated_at, true)) {
      console.warn('LAAP billing payment is still pending', transaction)
    }
  }))
  for (const outcome of outcomes) {
    if (outcome.status === 'rejected') console.error('LAAP billing payment retry failed', outcome.reason instanceof Error ? outcome.reason.name : 'unknown')
  }
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
    case 'session': return { user: { id: owner.id, email: owner.email, role: 'owner' } }
    case 'overview': {
      let totalUsers = 0
      try {
        const usersRes = await fetch(new URL('/auth/v1/admin/users?per_page=100', env.SUPABASE_URL), {
          headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY },
          signal: AbortSignal.timeout(5000),
        })
        if (usersRes.ok) {
          const authData = record(await usersRes.json())
          if (Array.isArray(authData.users)) totalUsers = authData.users.length
        }
      } catch (err) {
        console.warn('Failed to fetch auth users for overview', err)
      }

      let giftsList: Data[] = []
      try {
        giftsList = (await rpc<Data[]>(env, 'gifts', { p_owner: owner.id })) || []
      } catch (err) {
        console.warn('Failed to fetch gifts for overview', err)
      }
      const totalGifts = giftsList.length
      const activeGifts = giftsList.filter((g) => !g.revoked_at && (!g.ends_at || Date.parse(string(g.ends_at)) > Date.now())).length
      const redeemedGifts = giftsList.filter((g) => !!g.redeemed_at).length

      let totalRevenue = 0
      let monthlySubs = 0
      let yearlySubs = 0
      let lifetimeSubs = 0
      try {
        const txns = (await paddleResponse(env, '/transactions?status=completed&per_page=50')).data
        if (Array.isArray(txns)) {
          for (const t of txns) {
            const rec = record(t)
            const totals = record(record(rec.details).totals)
            const grand = Number(totals.grand_total) || 0
            totalRevenue += grand / 100
            const items = Array.isArray(rec.items) ? rec.items : []
            for (const it of items) {
              const priceId = record(record(it).price).id
              if (priceId === env.PADDLE_LIFETIME_PRICE) lifetimeSubs++
            }
          }
        }
        const subs = (await paddleResponse(env, '/subscriptions?status=active&per_page=50')).data
        if (Array.isArray(subs)) {
          for (const s of subs) {
            const rec = record(s)
            const items = Array.isArray(rec.items) ? rec.items : []
            for (const it of items) {
              const priceId = record(record(it).price).id
              if (priceId === env.PADDLE_MONTHLY_PRICE) monthlySubs++
              else if (priceId === env.PADDLE_YEARLY_PRICE) yearlySubs++
            }
          }
        }
      } catch (err) {
        console.warn('Failed to query Paddle metrics', err)
      }

      const mrr = (monthlySubs * 3) + (yearlySubs * 20 / 12)
      return {
        metrics: {
          totalUsers,
          activeSubscribers: monthlySubs + yearlySubs + lifetimeSubs + activeGifts,
          planCounts: {
            monthly: monthlySubs,
            yearly: yearlySubs,
            lifetime: lifetimeSubs,
            gifts: activeGifts,
          },
          mrr: Math.round(mrr * 100) / 100,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalGifts,
          activeGifts,
          redeemedGifts,
        },
        health: {
          worker: 'healthy',
          supabase: 'healthy',
          paddle: env.PADDLE_MODE,
        },
      }
    }
    case 'customers': {
      let usersList: Data[] = []
      try {
        const usersRes = await fetch(new URL('/auth/v1/admin/users?per_page=100', env.SUPABASE_URL), {
          headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY },
          signal: AbortSignal.timeout(5000),
        })
        if (usersRes.ok) {
          const authData = record(await usersRes.json())
          if (Array.isArray(authData.users)) usersList = authData.users as Data[]
        }
      } catch (err) {
        console.warn('Failed to fetch auth users for customers', err)
      }

      const giftsList = (await rpc<Data[]>(env, 'gifts', { p_owner: owner.id }).catch(() => [])) || []

      const customers = await Promise.all(
        usersList.map(async (u) => {
          const id = string(u.id)
          const userEmail = string(u.email)
          let hasPro = false
          try {
            const chk = await rpc<Data>(env, 'prepare_checkout', { p_buyer: id, p_plan: 'monthly' })
            if (chk && chk.error === 'This account already has Pro.') {
              hasPro = true
            } else if (chk && chk.id) {
              await rpc(env, 'finish_checkout', { p_id: string(chk.id), p_transaction: null, p_url: null, p_close: true }).catch(() => {})
            }
          } catch {
            // ignore
          }

          const matchedGift = giftsList.find((g) => (g.buyer === id || g.recipient === userEmail) && !g.revoked_at)

          return {
            id,
            email: userEmail,
            createdAt: string(u.created_at),
            confirmedAt: string(u.email_confirmed_at) || null,
            lastSignInAt: string(u.last_sign_in_at) || null,
            hasPro,
            plan: hasPro ? (matchedGift ? `gift (${matchedGift.duration})` : 'paddle') : 'none',
            giftId: matchedGift ? string(matchedGift.id) : null,
            endsAt: matchedGift?.ends_at ? string(matchedGift.ends_at) : null,
          }
        }),
      )
      return { customers }
    }
    case 'grant-pro': {
      const targetEmail = email(data.email)
      const targetUserId = matches(data.buyerId, uid, 'Invalid buyer ID.')
      const duration = matches(data.duration, /^(month|year|lifetime)$/, 'Choose a gift duration.')

      // Close any pending open checkout for this user first
      const pending = await rpc<{ id?: string } | null>(env, 'pending_checkout', { p_buyer: targetUserId }).catch(() => null)
      if (pending?.id) {
        await rpc(env, 'finish_checkout', { p_id: pending.id, p_transaction: null, p_url: null, p_close: true }).catch(() => {})
      }

      const code = 'LAAP-' + randomCode(24)
      const gift = await rpc<Data>(env, 'create_gift', {
        p_owner: owner.id,
        p_hash: await hash(code),
        p_duration: duration,
        p_email: targetEmail,
      })
      const grant = await rpc<Grant>(env, 'redeem', {
        p_buyer: targetUserId,
        p_email: targetEmail,
        p_hash: await hash(code),
      })
      if (grant.error && grant.error !== 'You already have Pro. Your gift code has not been used.') {
        throw new Failure(409, grant.error)
      }
      return { ok: true, giftId: gift.id, duration, code }
    }
    case 'revoke-pro': {
      const buyerId = matches(data.buyerId, uid, 'Invalid buyer ID.')
      let revokedSomething = false

      // 1. Check if user has active gift
      const giftId = string(data.giftId)
      if (giftId && uid.test(giftId)) {
        await rpc(env, 'revoke_gift', { p_owner: owner.id, p_id: giftId })
        revokedSomething = true
      } else {
        const giftsList = (await rpc<Data[]>(env, 'gifts', { p_owner: owner.id }).catch(() => [])) || []
        const activeGifts = giftsList.filter((g) => g.buyer === buyerId && !g.revoked_at)
        for (const g of activeGifts) {
          await rpc(env, 'revoke_gift', { p_owner: owner.id, p_id: string(g.id) })
          revokedSomething = true
        }
      }

      // 2. Check if user has Paddle transactions
      const customerId = await rpc<string | null>(env, 'customer', { p_buyer: buyerId }).catch(() => null)
      if (customerId && /^ctm_[a-z0-9]+$/.test(customerId)) {
        try {
          const paddleTxns = (await paddleResponse(env, `/transactions?customer_id=${customerId}&per_page=10`)).data
          if (Array.isArray(paddleTxns)) {
            for (const t of paddleTxns) {
              const rec = record(t)
              const txnId = string(rec.id)
              if (txnId && /^txn_[a-z0-9]+$/.test(txnId)) {
                await rpc(env, 'adjustment', {
                  p_event: 'evt_owner_revoke_' + txnId + '_' + Date.now(),
                  p_id: 'adj_owner_revoke_' + txnId + '_' + Date.now(),
                  p_transaction: txnId,
                  p_occurred: new Date().toISOString(),
                  p_action: 'refund',
                  p_status: 'approved',
                  p_full: true,
                })
                revokedSomething = true
                if (rec.subscription_id && /^sub_[a-z0-9]+$/.test(string(rec.subscription_id))) {
                  try {
                    await paddleResponse(env, `/subscriptions/${rec.subscription_id}/cancel`, { effective_from: 'immediately' }, 'POST')
                  } catch (subErr) {
                    console.warn('Could not cancel Paddle subscription', rec.subscription_id, subErr)
                  }
                }
              }
            }
          }
        } catch (paddleErr) {
          console.warn('Could not query Paddle transactions for customer', customerId, paddleErr)
        }
      }

      if (!revokedSomething) {
        throw new Failure(404, 'No active license or subscription found to revoke.')
      }
      return { ok: true }
    }
    case 'audit': {
      let transactions: Data[] = []
      try {
        const txns = (await paddleResponse(env, '/transactions?per_page=20')).data
        if (Array.isArray(txns)) transactions = txns as Data[]
      } catch (err) {
        console.warn('Failed to query Paddle transactions for audit', err)
      }
      const giftsList = (await rpc<Data[]>(env, 'gifts', { p_owner: owner.id }).catch(() => [])) || []
      return { transactions, gifts: giftsList }
    }
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
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }
    const path = new URL(request.url).pathname
    try {
      if (request.method === 'GET') {
        if (path === '/health') return json({ ok: true })
        if (path === '/checkout') return checkoutPage(env.PADDLE_MODE === 'sandbox', checkoutToken(env))
        if (path === '/gifts') return giftPage()
        if (path.startsWith('/v1/owner/')) return json(await ownerRequest(request, env, path.slice(10), {}))
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
      console.error('Unhandled LAAP billing error', path, cause instanceof Error ? (cause.stack || cause.message) : String(cause))
      return json({ error: 'Billing is temporarily unavailable. Try again shortly.' }, 503)
    }
  },
  async scheduled(_event: unknown, env: BillingEnv) {
    const results = await Promise.allSettled([reconcileEvents(env), reconcilePayments(env), rpc(env, 'cleanup', {})])
    if (results.some((result) => result.status === 'rejected')) throw new Error('LAAP billing scheduled reconciliation failed.')
  },
}
