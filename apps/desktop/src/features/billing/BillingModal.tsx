import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CreditCard,
  Crown,
  Gift,
  KeyRound,
  Laptop,
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

type PlanId = 'monthly' | 'yearly' | 'lifetime'
type Step = 'plans' | 'email' | 'gift'

interface Plan {
  id: PlanId
  label: string
  title: string
  price: string
  cadence: string
  highlight: string
  badge?: { text: string; theme: 'amethyst' | 'gold' | 'cyan' }
  cardTheme: 'monthly' | 'yearly' | 'lifetime'
}

const plans: Plan[] = [
  {
    id: 'monthly',
    label: '$3 monthly',
    title: 'Monthly',
    price: '$3',
    cadence: '/ month',
    highlight: 'Pay month-to-month, cancel anytime',
    badge: { text: 'FLEXIBLE', theme: 'cyan' },
    cardTheme: 'monthly',
  },
  {
    id: 'yearly',
    label: '$20 yearly',
    title: 'Yearly',
    price: '$20',
    cadence: '/ year',
    highlight: 'Save 44% ($1.67/mo)',
    badge: { text: 'POPULAR · SAVE 44%', theme: 'amethyst' },
    cardTheme: 'yearly',
  },
  {
    id: 'lifetime',
    label: '$60 lifetime',
    title: 'Lifetime',
    price: '$60',
    cadence: 'one-time',
    highlight: 'Pay once, keep Pro forever',
    badge: { text: 'BEST VALUE', theme: 'gold' },
    cardTheme: 'lifetime',
  },
]

export function BillingModal({ status, onClose, onStatus }: {
  status: BillingStatus
  onClose: () => void
  onStatus: (status: BillingStatus) => void
}) {
  const [step, setStep] = useState<Step>('plans')
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('yearly')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [gift, setGift] = useState('')
  const [transfer, setTransfer] = useState(false)
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
        // Keep current membership state
      }
    } finally {
      setBusy(false)
    }
  }

  const sendCode = () => void run(async () => {
    setCode('')
    await invokeTauri('billing_send_code', { email })
    setMessage('Check your email for a sign-in code.')
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
      setStep('plans')
      setMessage('Activation transferred to this computer.')
    } else {
      setStep('plans')
      setMessage('Email verified. You can now proceed to checkout or manage your plan.')
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

  const handleNextFromPlans = () => {
    if (status.signedIn) {
      openCheckout()
    } else {
      setError('')
      setMessage('')
      setStep('email')
    }
  }

  const handleStartTransfer = () => {
    setTransfer(true)
    setCode('')
    setError('')
    setMessage('')
    setStep('email')
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
        {/* Header with clean top-right Close button */}
        <header className="billing-modal-head">
          <div className="billing-brand-lockup">
            <span className={`billing-brand-mark ${status.pro ? 'is-pro' : ''}`} aria-hidden="true">
              {status.pro ? <Crown size={20} /> : <Sparkles size={20} />}
            </span>
            <div className="billing-brand-copy">
              <span className="billing-eyebrow">LAAP MEMBERSHIP</span>
              <div className="billing-brand-title">
                <h2 className="billing-modal-title">LAAP {status.pro ? 'Pro' : 'Membership'}</h2>
                <span className={status.pro ? 'billing-status-tag is-pro' : 'billing-status-tag'}>
                  {status.pro ? <><Check size={11} /> PRO ACTIVE</> : 'BASIC'}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="billing-close"
            aria-label="Close billing"
            disabled={busy}
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        {/* Modal Body */}
        <div className="billing-modal-body">
          {/* Pro Active State */}
          {status.pro ? (
            <section className="billing-pro-hero" aria-label="Your Pro subscription">
              <div className="billing-pro-emblem" aria-hidden="true">
                <Crown size={32} />
              </div>
              <div className="billing-pro-title">Pro License Active</div>
              <p id="billing-modal-description" className="billing-pro-desc">
                Unlimited saved profiles are active on this computer.
              </p>
              {status.expiresAt && (
                <div className="billing-pro-expiry-pill">
                  <ShieldCheck size={14} aria-hidden="true" />
                  <span>Offline access valid through {new Date(status.expiresAt * 1000).toLocaleDateString()}</span>
                </div>
              )}
              <div className="billing-pro-actions">
                <button
                  type="button"
                  className="billing-btn billing-btn-primary"
                  disabled={busy}
                  onClick={() => void run(async () => {
                    onStatus(await invokeTauri<BillingStatus>('billing_status', { refresh: true, force: true }))
                    setMessage('License checked.')
                  })}
                >
                  <RefreshCw size={14} /> Check license
                </button>
                <button
                  type="button"
                  className="billing-btn billing-btn-glass"
                  disabled={busy || !status.signedIn}
                  onClick={manage}
                >
                  <CreditCard size={14} /> Manage payments
                </button>
                <button
                  type="button"
                  className="billing-btn billing-btn-glass"
                  disabled={busy || !status.signedIn}
                  onClick={handleStartTransfer}
                >
                  <Laptop size={14} /> Transfer PC
                </button>
              </div>
            </section>
          ) : (
            <>
              {/* STEP 1: Plan Selection */}
              {step === 'plans' && (
                <section className="billing-step-section" aria-label="Select a plan">
                  <p id="billing-modal-description" className="billing-clean-subtitle">
                    Unlock unlimited profiles, instant account switching, and offline vaults.
                  </p>

                  {/* 3 Colorful Plan Cards */}
                  <div className="billing-cards-grid" role="group" aria-label="Membership plans">
                    {plans.map((plan) => {
                      const isSelected = selectedPlan === plan.id
                      return (
                        <button
                          key={plan.id}
                          type="button"
                          className={`billing-plan-card ${plan.cardTheme} ${isSelected ? 'is-selected' : ''}`}
                          aria-label={plan.label}
                          aria-pressed={isSelected}
                          disabled={busy}
                          onClick={() => setSelectedPlan(plan.id)}
                        >
                          {plan.badge && (
                            <span className={`billing-card-badge ${plan.badge.theme}`}>
                              {plan.badge.text}
                            </span>
                          )}
                          <div className="billing-card-top">
                            <span className="billing-card-title">{plan.title}</span>
                            <span className={`billing-card-radio ${isSelected ? 'is-checked' : ''}`} aria-hidden="true">
                              {isSelected && <Check size={11} strokeWidth={3} />}
                            </span>
                          </div>
                          <div className="billing-card-price-row">
                            <span className="billing-card-price">{plan.price}</span>
                            <span className="billing-card-cadence">{plan.cadence}</span>
                          </div>
                          <span className="billing-card-highlight">{plan.highlight}</span>
                        </button>
                      )
                    })}
                  </div>

                  {/* Primary Next / Checkout Action */}
                  <div className="billing-cta-area">
                    <button
                      type="button"
                      className="billing-btn billing-btn-cta"
                      disabled={busy}
                      onClick={handleNextFromPlans}
                    >
                      {status.signedIn
                        ? `Continue to Checkout (${selected.price})`
                        : `Next: Enter Email (${selected.price})`}
                      <ArrowRight size={16} />
                    </button>
                  </div>

                  {/* Secondary Clean Actions Footer */}
                  <div className="billing-secondary-bar">
                    <button
                      type="button"
                      className="billing-action-link"
                      disabled={busy}
                      onClick={() => setStep('gift')}
                    >
                      <Gift size={14} /> Redeem a gift code
                    </button>
                    <span className="billing-dot">·</span>
                    <button
                      type="button"
                      className="billing-action-link"
                      disabled={busy}
                      onClick={() => {
                        if (status.signedIn) void activate()
                        else setStep('email')
                      }}
                    >
                      <Zap size={14} /> Activate Pro
                    </button>
                    <span className="billing-dot">·</span>
                    <button
                      type="button"
                      className="billing-action-link"
                      disabled={busy}
                      onClick={handleStartTransfer}
                    >
                      <Laptop size={14} /> Transfer PC
                    </button>
                    {status.signedIn && (
                      <>
                        <span className="billing-dot">·</span>
                        <button
                          type="button"
                          className="billing-action-link"
                          disabled={busy}
                          onClick={manage}
                        >
                          <CreditCard size={14} /> Manage payments
                        </button>
                      </>
                    )}
                  </div>
                </section>
              )}

              {/* STEP 2: Email Verification */}
              {step === 'email' && (
                <section className="billing-step-section" aria-label="Email verification">
                  <div className="billing-step-header">
                    <button
                      type="button"
                      className="billing-back-btn"
                      disabled={busy}
                      onClick={() => { setStep('plans'); setTransfer(false) }}
                    >
                      <ArrowLeft size={14} /> Back to plans
                    </button>
                    <div className="billing-plan-pill-mini">
                      Selected: <strong>{selected.title} Pro ({selected.price})</strong>
                    </div>
                  </div>

                  <form className="billing-auth-box" onSubmit={(event) => { event.preventDefault(); verify() }}>
                    <div className="billing-auth-meta">
                      <h3>{transfer ? 'Transfer PC Activation' : 'Verify Your Email'}</h3>
                      <p>
                        {transfer
                          ? 'Enter a code sent to your billing email to move your license here.'
                          : 'Enter your billing email to receive a 6-digit verification code.'}
                      </p>
                    </div>

                    <div className="billing-input-group">
                      <label htmlFor="billing-email-input" className="billing-input-label">
                        <Mail size={13} /> Billing email
                      </label>
                      <div className="billing-input-action-row">
                        <input
                          id="billing-email-input"
                          aria-label="Billing email"
                          type="email"
                          autoComplete="email"
                          required
                          placeholder="name@example.com"
                          className="billing-text-input"
                          value={email}
                          disabled={busy}
                          onChange={(event) => setEmail(event.target.value)}
                        />
                        <button
                          type="button"
                          className="billing-btn billing-btn-glass"
                          disabled={busy || !email.trim()}
                          onClick={sendCode}
                        >
                          Send email code
                        </button>
                      </div>
                    </div>

                    <div className="billing-input-group">
                      <label htmlFor="billing-code-input" className="billing-input-label">
                        <KeyRound size={13} /> Email code
                      </label>
                      <div className="billing-input-action-row">
                        <input
                          id="billing-code-input"
                          aria-label="Email code"
                          type="text"
                          autoComplete="one-time-code"
                          inputMode="numeric"
                          placeholder="6-digit code"
                          maxLength={10}
                          required
                          className="billing-text-input mono"
                          value={code}
                          disabled={busy}
                          onChange={(event) => setCode(event.target.value)}
                        />
                        <button
                          type="submit"
                          className="billing-btn billing-btn-primary"
                          disabled={busy || code.length < 6}
                        >
                          {transfer ? 'Confirm transfer' : 'Verify email'}
                        </button>
                      </div>
                    </div>
                  </form>
                </section>
              )}

              {/* STEP 3: Gift Redemption */}
              {step === 'gift' && (
                <section className="billing-step-section" aria-label="Redeem gift code">
                  <div className="billing-step-header">
                    <button
                      type="button"
                      className="billing-back-btn"
                      disabled={busy}
                      onClick={() => setStep('plans')}
                    >
                      <ArrowLeft size={14} /> Back to plans
                    </button>
                  </div>

                  <form
                    className="billing-auth-box"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void run(async () => {
                        onStatus(await invokeTauri<BillingStatus>('billing_redeem', { code: gift }))
                        setGift('')
                      })
                    }}
                  >
                    <div className="billing-auth-meta">
                      <h3>Redeem Gift or Promo Code</h3>
                      <p>Enter your 32-character code to immediately activate Pro on this PC.</p>
                    </div>

                    <div className="billing-input-group">
                      <label htmlFor="billing-gift-input" className="billing-input-label">
                        <Gift size={13} /> Gift code
                      </label>
                      <div className="billing-input-action-row">
                        <input
                          id="billing-gift-input"
                          aria-label="Gift code"
                          placeholder="LAAP-XXXX-XXXX"
                          maxLength={48}
                          required
                          className="billing-text-input mono uppercase"
                          value={gift}
                          disabled={busy}
                          onChange={(event) => setGift(event.target.value)}
                        />
                        <button
                          type="submit"
                          className="billing-btn billing-btn-primary"
                          disabled={busy || !gift.trim()}
                        >
                          Redeem gift code
                        </button>
                      </div>
                    </div>
                  </form>
                </section>
              )}
            </>
          )}

          {/* Feedback & Alerts */}
          {error && (
            <div className="billing-alert error" role="alert">
              <span className="billing-alert-icon">!</span>
              <div className="billing-alert-content">
                <p>{error}</p>
                {error.includes('Close your pending checkout') && status.signedIn && (
                  <button
                    type="button"
                    className="billing-action-link"
                    style={{ marginTop: '4px' }}
                    disabled={busy}
                    onClick={() => void run(async () => {
                      await invokeTauri('billing_cancel_checkout')
                      setMessage('Pending checkout closed. You can now redeem your gift code.')
                    })}
                  >
                    Close pending checkout
                  </button>
                )}
              </div>
            </div>
          )}

          {message && (
            <div className="billing-alert success" role="status">
              <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
              <span>{message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
