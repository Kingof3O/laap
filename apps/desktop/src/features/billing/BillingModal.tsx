import { useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CreditCard,
  Crown,
  Gift,
  KeyRound,
  Laptop,
  Layers,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import { invokeTauri } from '../../lib/api'
import { useDialog } from '../../shared/hooks/useDialog'
import type { BillingStatus } from './useBilling'

interface PlanTier {
  id: string
  label: string
  name: string
  price: string
  period: string
  highlight: string
  tag?: { text: string; type: 'popular' | 'value' }
  cardClass?: string
  btnClass: string
}

const plans: PlanTier[] = [
  {
    id: 'monthly',
    label: '$3 monthly',
    name: 'Monthly',
    price: '$3',
    period: '/ mo',
    highlight: 'Flexible access, cancel anytime',
    btnClass: 'btn-plan-default',
  },
  {
    id: 'yearly',
    label: '$20 yearly',
    name: 'Yearly',
    price: '$20',
    period: '/ yr',
    highlight: 'Save 44% ($1.67/mo)',
    tag: { text: 'POPULAR · SAVE 44%', type: 'popular' },
    cardClass: 'featured',
    btnClass: 'btn-plan-popular',
  },
  {
    id: 'lifetime',
    label: '$60 lifetime',
    name: 'Lifetime',
    price: '$60',
    period: 'once',
    highlight: 'Pay once, keep Pro forever',
    tag: { text: 'BEST VALUE', type: 'value' },
    cardClass: 'lifetime',
    btnClass: 'btn-plan-gold',
  },
]

export function BillingModal({ status, onClose, onStatus }: {
  status: BillingStatus
  onClose: () => void
  onStatus: (status: BillingStatus) => void
}) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [gift, setGift] = useState('')
  const [transfer, setTransfer] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const dialog = useDialog(true, onClose, busy)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    setMessage('')
    try { await action() }
    catch (cause) {
      setError(String(cause))
      try { onStatus(await invokeTauri<BillingStatus>('billing_status', { refresh: false })) } catch { /* Keep the current view. */ }
    } finally { setBusy(false) }
  }

  const sendCode = () => void run(async () => {
    setCode('')
    await invokeTauri('billing_send_code', { email })
    setMessage('Check your email for a sign-in code.')
  })

  const verify = () => void run(async () => {
    const next = await invokeTauri<BillingStatus>(transfer ? 'billing_transfer' : 'billing_verify_email', { email, code })
    onStatus(next)
    setCode('')
    if (transfer) {
      setTransfer(false)
      setMessage('Activation transferred to this computer.')
    }
  })

  return (
    <div className="modal-backdrop">
      <div className="modal-panel billing-modal-panel" ref={dialog} role="dialog" aria-modal="true" aria-label="LAAP billing" tabIndex={-1}>
        {/* Header */}
        <div className="modal-head billing-modal-head">
          <div className="billing-head-title-wrap">
            <div className={`billing-head-icon ${status.pro ? 'pro' : ''}`}>
              {status.pro ? <Crown size={19} /> : <Sparkles size={19} />}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 className="modal-title billing-modal-title">LAAP {status.pro ? 'Pro' : 'Basic'}</h2>
                <span className={`billing-tier-badge ${status.pro ? 'pro' : 'basic'}`}>
                  {status.pro ? <><Check size={11} /> PRO ACTIVE</> : 'BASIC'}
                </span>
              </div>
            </div>
          </div>
          <button type="button" className="modal-close-btn" aria-label="Close billing" disabled={busy} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body billing-modal-body">
          {/* Status description */}
          {!status.pro && (
            <div className="billing-hero-card">
              <p>Basic includes two active profiles. Pro unlocks unlimited profiles on one computer.</p>
              <div className="billing-feature-chips">
                <span className="billing-chip"><Layers size={13} /> Unlimited Profiles</span>
                <span className="billing-chip"><Zap size={13} /> 1-Click Fast Switching</span>
                <span className="billing-chip"><ShieldCheck size={13} /> Offline Vault Storage</span>
              </div>
            </div>
          )}

          {/* Pricing bar for signed-out users */}
          {!status.pro && !status.signedIn && (
            <div className="billing-pricing-teaser">
              <span className="billing-teaser-pill">$3 monthly</span>
              <span className="billing-teaser-dot">·</span>
              <span className="billing-teaser-pill">$20 yearly</span>
              <span className="billing-teaser-dot">·</span>
              <span className="billing-teaser-pill">$60 lifetime</span>
            </div>
          )}

          {/* Pro State View */}
          {status.pro && (
            <div className="billing-pro-hero">
              <div className="billing-pro-badge-icon">
                <Crown size={30} />
              </div>
              <div className="billing-pro-hero-title">Pro License Active</div>
              <p>Unlimited saved profiles are active on this computer.</p>
              {status.expiresAt && (
                <div className="billing-pro-offline-pill">
                  <ShieldCheck size={14} />
                  <span>Offline access through {new Date(status.expiresAt * 1000).toLocaleDateString()} unless renewed sooner.</span>
                </div>
              )}
              <div className="billing-pro-actions-row">
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => void run(async () => {
                  onStatus(await invokeTauri<BillingStatus>('billing_status', { refresh: true, force: true }))
                  setMessage('License checked.')
                })}>
                  <RefreshCw size={14} /> Check license
                </button>
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => void run(() => invokeTauri('billing_open_page', { plan: null }))}>
                  <CreditCard size={14} /> Manage payments
                </button>
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setTransfer(true); setCode('') }}>
                  <Laptop size={14} /> Transfer activation
                </button>
              </div>
            </div>
          )}

          {/* Sign In / Transfer Authentication Form */}
          {(!status.signedIn || transfer) && (
            <div className="billing-auth-container">
              <form className="billing-auth-card" onSubmit={(event) => { event.preventDefault(); verify() }}>
                <h4 className="billing-auth-title">{transfer ? 'Transfer Activation to this PC' : 'Billing Sign-In'}</h4>
                <p className="billing-auth-subtitle">
                  {transfer
                    ? 'Get a fresh code for the billing email to move your activation.'
                    : 'Enter your billing email to manage your plan or redeem gifts.'}
                </p>

                <div className="billing-field-group">
                  <label htmlFor="billing-email-input" className="billing-field-label-text">
                    <Mail size={13} /> Billing email
                  </label>
                  <div className="billing-input-button-row">
                    <input
                      id="billing-email-input"
                      aria-label="Billing email"
                      type="email"
                      className="billing-input-field"
                      autoComplete="email"
                      placeholder="name@example.com"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                    <button type="button" className="btn-secondary" onClick={sendCode} disabled={busy || !email.trim()}>
                      Send email code
                    </button>
                  </div>
                </div>

                <div className="billing-field-group">
                  <label htmlFor="billing-code-input" className="billing-field-label-text">
                    <KeyRound size={13} /> Email code
                  </label>
                  <div className="billing-input-button-row">
                    <input
                      id="billing-code-input"
                      aria-label="Email code"
                      className="billing-input-field billing-input-code"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      placeholder="6-digit code"
                      maxLength={10}
                      required
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                    />
                    <button type="submit" className="btn-primary" disabled={busy || code.length < 6}>
                      {transfer ? 'Confirm transfer' : 'Verify email'}
                    </button>
                  </div>
                </div>

                {transfer && (
                  <button type="button" className="btn-secondary" style={{ alignSelf: 'flex-start', marginTop: '4px' }} disabled={busy} onClick={() => { setTransfer(false); setCode('') }}>
                    Cancel transfer
                  </button>
                )}
              </form>
            </div>
          )}

          {/* Signed In Non-Pro Options */}
          {status.signedIn && !transfer && !status.pro && (
            <>
              {/* Pricing Cards Grid */}
              <div className="billing-plans-grid">
                {plans.map((plan) => (
                  <div key={plan.id} className={`billing-plan-card ${plan.cardClass ?? ''}`}>
                    {plan.tag && (
                      <span className={`plan-tag ${plan.tag.type}`}>
                        {plan.tag.text}
                      </span>
                    )}
                    <div>
                      <div className="plan-title">{plan.name}</div>
                      <div className="plan-price-row">
                        <span className="plan-price-value">{plan.price}</span>
                        <span className="plan-price-freq">{plan.period}</span>
                      </div>
                      <div className="plan-highlight-text">{plan.highlight}</div>
                    </div>
                    <button
                      type="button"
                      className={`btn-plan-action ${plan.btnClass}`}
                      disabled={busy}
                      onClick={() => void run(async () => {
                        await invokeTauri('billing_open_page', { plan: plan.id })
                        setMessage('After checkout, return here and select Activate Pro.')
                      })}
                    >
                      {plan.label}
                    </button>
                  </div>
                ))}
              </div>

              {/* Sub-actions bar: Activate Pro & Transfer */}
              <div className="billing-sub-actions-card">
                <div className="billing-sub-actions-head">
                  <span className="billing-sub-actions-label">Post-Checkout / Device Sync</span>
                </div>
                <div className="billing-sub-actions-row">
                  <button
                    type="button"
                    className="billing-sub-btn highlight"
                    disabled={busy}
                    onClick={() => void run(async () => {
                      onStatus(await invokeTauri<BillingStatus>('billing_activate'))
                    })}
                  >
                    <Zap size={14} /> Activate Pro
                  </button>
                  <button
                    type="button"
                    className="billing-sub-btn"
                    disabled={busy}
                    onClick={() => { setTransfer(true); setCode('') }}
                  >
                    <Laptop size={14} /> Transfer activation
                  </button>
                </div>
              </div>

              {/* Gift code redemption card */}
              <div className="billing-gift-card">
                <div className="billing-gift-head">
                  <Gift size={14} />
                  <span>Redeem Gift or Promo Code</span>
                </div>
                <form
                  className="billing-gift-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void run(async () => {
                      onStatus(await invokeTauri<BillingStatus>('billing_redeem', { code: gift }))
                      setGift('')
                    })
                  }}
                >
                  <div className="billing-field-group" style={{ margin: 0 }}>
                    <label htmlFor="billing-gift-input" className="billing-field-label-text" style={{ fontSize: '11.5px' }}>
                      Gift code
                    </label>
                    <div className="billing-gift-input-row">
                      <input
                        id="billing-gift-input"
                        aria-label="Gift code"
                        className="billing-input-gift"
                        placeholder="LAAP-XXXX-XXXX"
                        maxLength={48}
                        value={gift}
                        onChange={(event) => setGift(event.target.value)}
                      />
                      <button type="submit" className="btn-redeem" disabled={busy || !gift.trim()}>
                        Redeem gift code
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* Manage payments footer */}
              <div className="billing-footer-row">
                <button
                  type="button"
                  className="billing-footer-link"
                  disabled={busy}
                  onClick={() => void run(() => invokeTauri('billing_open_page', { plan: null }))}
                >
                  <CreditCard size={14} /> Manage payments
                </button>
              </div>
            </>
          )}

          {/* Error and Alert Display */}
          {error && (
            <div className="billing-alert error" role="alert">
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div>{error}</div>
                {error.includes('Close your pending checkout') && status.signedIn && (
                  <div className="billing-pending-close-wrap">
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '11.5px' }}
                      disabled={busy}
                      onClick={() => void run(async () => {
                        await invokeTauri('billing_cancel_checkout')
                        setMessage('Checkout closed. You can now redeem your gift code.')
                      })}
                    >
                      Close pending checkout
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Success Message Display */}
          {message && (
            <div className="billing-alert success" role="status">
              <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
