import { useState } from 'react'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Crown,
  Gift,
  KeyRound,
  Laptop,
  LockKeyhole,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { invokeTauri } from '../../lib/api'
import { useDialog } from '../../shared/hooks/useDialog'
import type { BillingStatus } from './useBilling'

type PlanId = 'monthly' | 'yearly' | 'lifetime'

interface Plan {
  id: PlanId
  label: string
  title: string
  price: string
  cadence: string
  note: string
  detail: string
  ribbon?: string
}

const plans: Plan[] = [
  {
    id: 'monthly',
    label: '$3 monthly',
    title: 'Monthly',
    price: '$3',
    cadence: '/ month',
    note: 'Pay as you go',
    detail: 'Cancel any time',
  },
  {
    id: 'yearly',
    label: '$20 yearly',
    title: 'Yearly',
    price: '$20',
    cadence: '/ year',
    note: '$1.67 per month',
    detail: 'Save 44% vs monthly',
    ribbon: 'SAVE 44%',
  },
  {
    id: 'lifetime',
    label: '$60 lifetime',
    title: 'Lifetime',
    price: '$60',
    cadence: 'one time',
    note: 'Single payment',
    detail: 'Periodic license checks',
  },
]

export function BillingModal({ status, onClose, onStatus }: {
  status: BillingStatus
  onClose: () => void
  onStatus: (status: BillingStatus) => void
}) {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('yearly')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [gift, setGift] = useState('')
  const [transfer, setTransfer] = useState(false)
  const [giftOpen, setGiftOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const dialog = useDialog(true, onClose, busy)
  const selected = plans.find((plan) => plan.id === selectedPlan) ?? plans[1]

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (cause) {
      setError(String(cause))
      try {
        onStatus(await invokeTauri<BillingStatus>('billing_status', { refresh: false }))
      } catch {
        // Keep the current membership view if the native bridge is unavailable.
      }
    } finally {
      setBusy(false)
    }
  }

  const sendCode = () => void run(async () => {
    setCode('')
    await invokeTauri('billing_send_code', { email })
    setMessage('Code sent. Check your inbox, then enter it below.')
  })

  const verify = () => void run(async () => {
    const next = await invokeTauri<BillingStatus>(
      transfer ? 'billing_transfer' : 'billing_verify_email',
      { email, code },
    )
    onStatus(next)
    setCode('')
    if (transfer) {
      setTransfer(false)
      setMessage('Activation moved to this computer.')
    } else {
      setMessage('Email verified. You can continue to checkout or redeem a gift.')
    }
  })

  const openCheckout = () => void run(async () => {
    await invokeTauri('billing_open_page', { plan: selectedPlan })
    setMessage('Checkout opened in your browser. After payment, select Activate Pro below.')
  })

  const activate = () => void run(async () => {
    onStatus(await invokeTauri<BillingStatus>('billing_activate'))
  })

  const manage = () => void run(() => invokeTauri('billing_open_page', { plan: null }))

  const beginTransfer = () => {
    setTransfer(true)
    setCode('')
    setError('')
    setMessage('')
  }

  return (
    <div className="modal-backdrop billing-backdrop">
      <div
        className="modal-panel billing-modal-panel"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="LAAP billing"
        aria-describedby="billing-modal-description"
        tabIndex={-1}
      >
        <header className="billing-modal-head">
          <div className="billing-brand-lockup">
            <span className="billing-brand-mark" aria-hidden="true">
              {status.pro ? <Crown size={21} strokeWidth={1.7} /> : <Sparkles size={21} strokeWidth={1.7} />}
            </span>
            <div className="billing-brand-copy">
              <span className="billing-eyebrow">LAAP / MEMBERSHIP</span>
              <div className="billing-brand-title">
                <h2 className="billing-modal-title">LAAP {status.pro ? 'Pro' : 'Membership'}</h2>
                <span className={status.pro ? 'billing-status-tag is-pro' : 'billing-status-tag'}>
                  {status.pro ? <><Check size={12} /> ACTIVE</> : 'BASIC'}
                </span>
              </div>
            </div>
          </div>
          <button type="button" className="billing-close" aria-label="Close billing" disabled={busy} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="billing-modal-body">
          {status.pro ? (
            <section className="billing-active-view" aria-label="Your Pro subscription">
              <div className="billing-active-symbol" aria-hidden="true"><Crown size={28} /></div>
              <span className="billing-eyebrow">MEMBERSHIP ACTIVE</span>
              <h3>Every profile. One launcher.</h3>
              <p id="billing-modal-description">LAAP Pro is active on this computer. Your saved profiles are available without a slot limit.</p>
              {status.expiresAt && (
                <div className="billing-expiry">
                  <ShieldCheck size={16} aria-hidden="true" />
                  <span>Offline access valid through {new Date(status.expiresAt * 1000).toLocaleDateString()}; renews when a new license is issued.</span>
                </div>
              )}
              <div className="billing-active-actions">
                <button type="button" className="billing-button billing-button-primary" disabled={busy} onClick={() => void run(async () => {
                  onStatus(await invokeTauri<BillingStatus>('billing_status', { refresh: true, force: true }))
                  setMessage('Your license has been checked.')
                })}>
                  <RefreshCw size={16} /> Check license
                </button>
                <button type="button" className="billing-button billing-button-quiet" disabled={busy || !status.signedIn} onClick={manage}>
                  <CreditCard size={16} /> Manage payments
                </button>
                <button type="button" className="billing-button billing-button-quiet" disabled={busy || !status.signedIn} onClick={beginTransfer}>
                  <Laptop size={16} /> Move license
                </button>
              </div>
            </section>
          ) : (
            <>
              <section className="billing-intro" aria-label="LAAP Pro benefits">
                <div className="billing-intro-copy">
                  <span className="billing-eyebrow">ONE APP. NO PROFILE LIMIT.</span>
                  <h3>Make room for every account.</h3>
                  <p id="billing-modal-description">
                    Basic keeps two profiles active. Pro unlocks all your saved profiles without moving Riot sessions off this computer.
                  </p>
                </div>
                <div className="billing-intro-metric" aria-hidden="true">
                  <span>∞</span>
                  <small>PROFILES</small>
                </div>
              </section>
              <div className="billing-assurance">
                <span><CheckCircle2 size={14} aria-hidden="true" /> Same trusted launcher</span>
                <span><LockKeyhole size={14} aria-hidden="true" /> Local session vault</span>
                <span><ShieldCheck size={14} aria-hidden="true" /> One computer</span>
              </div>

              <section className="billing-plan-section" aria-labelledby="billing-plans-heading">
                <div className="billing-section-title">
                  <div>
                    <span className="billing-eyebrow">CHOOSE YOUR PLAN</span>
                    <h3 id="billing-plans-heading">The same Pro features, your terms.</h3>
                  </div>
                  <span className="billing-plan-hint">USD · secure browser checkout</span>
                </div>
                <div className="billing-plan-grid" role="group" aria-label="Select a Pro plan">
                  {plans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      className={'billing-plan-option' + (selectedPlan === plan.id ? ' is-selected' : '') + (plan.id === 'lifetime' ? ' is-lifetime' : '')}
                      aria-label={plan.label}
                      aria-pressed={selectedPlan === plan.id}
                      disabled={busy}
                      onClick={() => setSelectedPlan(plan.id)}
                    >
                      <span className="billing-plan-topline">
                        <span className="billing-plan-name">{plan.title}</span>
                        <span className="billing-radio-indicator" aria-hidden="true"><Check size={11} /></span>
                      </span>
                      <span className="billing-plan-price">
                        <strong>{plan.price}</strong>
                        <span>{plan.cadence}</span>
                      </span>
                      <span className="billing-plan-note">{plan.note}</span>
                      <span className="billing-plan-detail">{plan.ribbon ? <span className="billing-savings">{plan.detail}</span> : plan.detail}</span>
                    </button>
                  ))}
                </div>
                <p className="billing-license-note">
                  Lifetime is a one-time purchase; like subscriptions, it periodically verifies the license.
                </p>
              </section>

              {status.signedIn && !transfer && (
                <section className="billing-checkout-step" aria-label="Continue to checkout">
                  <div className="billing-checkout-copy">
                    <span className="billing-eyebrow">READY WHEN YOU ARE</span>
                    <h3>{selected.title} Pro <span>· {selected.price}</span></h3>
                    <p>Payment happens in your browser. Return to LAAP to activate the license.</p>
                  </div>
                  <button type="button" className="billing-button billing-button-primary billing-checkout-button" disabled={busy || !status.available} onClick={openCheckout}>
                    Continue to checkout <ArrowRight size={17} />
                  </button>
                </section>
              )}
            </>
          )}

          {(!status.signedIn || transfer) && (
            <section className="billing-auth-section" aria-label="Email verification">
              <div className="billing-auth-heading">
                <div className="billing-step-symbol" aria-hidden="true"><Mail size={19} /></div>
                <div>
                  <span className="billing-eyebrow">{transfer ? 'DEVICE TRANSFER' : 'STEP 01 / VERIFICATION'}</span>
                  <h3>{transfer ? 'Move your Pro activation' : 'Verify your billing email'}</h3>
                  <p>{transfer
                    ? 'Enter a fresh code sent to your billing email to authorize this computer.'
                    : 'No account is needed for Basic. Verify an email to buy Pro, restore a purchase or redeem a gift.'}</p>
                </div>
              </div>
              <form className="billing-auth-form" onSubmit={(event) => { event.preventDefault(); verify() }}>
                <div className="billing-form-field">
                  <label htmlFor="billing-email-input"><Mail size={14} aria-hidden="true" /> Billing email</label>
                  <div className="billing-input-with-action">
                    <input
                      id="billing-email-input"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="you@example.com"
                      value={email}
                      disabled={busy}
                      onChange={(event) => { setEmail(event.target.value); setCode('') }}
                    />
                    <button type="button" className="billing-button billing-button-soft" disabled={busy || !email.trim()} onClick={sendCode}>Send email code</button>
                  </div>
                </div>
                <div className="billing-form-field">
                  <label htmlFor="billing-code-input"><KeyRound size={14} aria-hidden="true" /> Email code</label>
                  <div className="billing-input-with-action">
                    <input
                      id="billing-code-input"
                      type="text"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      pattern="[0-9]{6,10}"
                      minLength={6}
                      maxLength={10}
                      required
                      placeholder="6-digit code"
                      value={code}
                      disabled={busy}
                      onChange={(event) => setCode(event.target.value)}
                    />
                    <button type="submit" className="billing-button billing-button-primary" disabled={busy || code.length < 6}>
                      {transfer ? 'Confirm transfer' : 'Verify email'} <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
                {transfer && (
                  <button type="button" className="billing-text-action" disabled={busy} onClick={() => { setTransfer(false); setCode('') }}>
                    Cancel transfer
                  </button>
                )}
              </form>
            </section>
          )}

          {status.signedIn && !transfer && !status.pro && (
            <section className="billing-tools" aria-label="Other licensing options">
              <div className="billing-restore-row">
                <div>
                  <h3>Already purchased Pro?</h3>
                  <p>Restore access on this computer after checkout or reinstalling.</p>
                </div>
                <button type="button" className="billing-button billing-button-soft" disabled={busy} onClick={activate}>
                  <RefreshCw size={15} /> Activate Pro
                </button>
              </div>
              <button
                type="button"
                className="billing-gift-toggle"
                aria-expanded={giftOpen}
                aria-controls="billing-gift-content"
                onClick={() => setGiftOpen((open) => !open)}
              >
                <span><Gift size={16} aria-hidden="true" /> Redeem a gift code</span>
                <ChevronDown size={16} aria-hidden="true" className={giftOpen ? 'is-open' : ''} />
              </button>
              {giftOpen && (
                <form
                  id="billing-gift-content"
                  className="billing-gift-content"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void run(async () => {
                      onStatus(await invokeTauri<BillingStatus>('billing_redeem', { code: gift }))
                      setGift('')
                    })
                  }}
                >
                  <label htmlFor="billing-gift-input">Gift code</label>
                  <div className="billing-input-with-action">
                    <input
                      id="billing-gift-input"
                      placeholder="LAAP-…"
                      maxLength={48}
                      value={gift}
                      disabled={busy}
                      onChange={(event) => setGift(event.target.value)}
                    />
                    <button type="submit" className="billing-button billing-button-soft" disabled={busy || !gift.trim()}>Redeem gift code</button>
                  </div>
                </form>
              )}
              <div className="billing-tools-footer">
                <button type="button" className="billing-text-action" disabled={busy} onClick={manage}>
                  <CreditCard size={15} /> Manage payments
                </button>
                <button type="button" className="billing-text-action" disabled={busy} onClick={beginTransfer}>
                  <Laptop size={15} /> Transfer activation
                </button>
              </div>
            </section>
          )}

          {!status.available && !status.pro && (
            <div className="billing-inline-notice" role="status">
              <LockKeyhole size={16} aria-hidden="true" />
              Billing isn't configured in this build. Basic remains available without a sign-in.
            </div>
          )}
          {error && (
            <div className="billing-feedback is-error" role="alert">
              <span className="billing-feedback-icon" aria-hidden="true"><X size={15} /></span>
              <div>
                <p>{error}</p>
                {error.includes('Close your pending checkout') && status.signedIn && (
                  <button type="button" className="billing-text-action" disabled={busy} onClick={() => void run(async () => {
                    await invokeTauri('billing_cancel_checkout')
                    setMessage('Pending checkout closed. Your gift code can now be redeemed.')
                  })}>
                    Close pending checkout
                  </button>
                )}
              </div>
            </div>
          )}
          {message && (
            <div className="billing-feedback is-success" role="status">
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>{message}</span>
            </div>
          )}
        </div>
        <footer className="billing-modal-footer">
          <LockKeyhole size={13} aria-hidden="true" />
          <span>Riot sessions stay local. Payments and licenses are handled separately.</span>
        </footer>
      </div>
    </div>
  )
}
