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
  features: string[]
}

const plans: Plan[] = [
  {
    id: 'monthly',
    label: '$3 monthly',
    title: 'Monthly',
    price: '$3',
    cadence: '/ month',
    highlight: 'Flexible month-to-month access',
    badge: { text: 'FLEXIBLE', theme: 'cyan' },
    cardTheme: 'monthly',
    features: [
      'Unlimited saved profile vault',
      'Instant 1-click Riot switching',
      'Cancel anytime without penalty',
    ],
  },
  {
    id: 'yearly',
    label: '$20 yearly',
    title: 'Yearly',
    price: '$20',
    cadence: '/ year',
    highlight: 'Save 44% ($1.67/mo billed annually)',
    badge: { text: 'MOST POPULAR · SAVE 44%', theme: 'amethyst' },
    cardTheme: 'yearly',
    features: [
      'Unlimited saved profile vault',
      'Instant 1-click Riot switching',
      'Priority offline vault storage',
      'Save 44% vs monthly billing',
    ],
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
    features: [
      'Unlimited saved profile vault',
      'Instant 1-click Riot switching',
      'Priority offline vault storage',
      'All future updates included',
      'One payment · No subscription',
    ],
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
                  {status.pro ? <><Check size={11} /> PRO ACTIVE</> : 'BASIC EDITION'}
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
                <Crown size={36} />
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
                  {/* Comparison Banner */}
                  <div className="billing-banner-row">
                    <div className="billing-banner-info">
                      <span className="billing-banner-pill basic">Basic: 2 Profiles</span>
                      <ArrowRight size={13} className="billing-banner-arrow" />
                      <span className="billing-banner-pill pro"><Crown size={12} /> Pro: Unlimited Profiles</span>
                    </div>
                    <span className="billing-banner-note">Instant 1-Click Switching · Local Session Vault</span>
                  </div>

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

                          {/* Feature checklist */}
                          <div className="billing-card-features">
                            {plan.features.map((feature, idx) => (
                              <div key={idx} className="billing-feature-item">
                                <span className={`billing-feature-check ${plan.cardTheme}`}>
                                  <Check size={10} strokeWidth={2.5} />
                                </span>
                                <span>{feature}</span>
                              </div>
                            ))}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Modern Footer Action Dock */}
                  <div className="billing-footer-dock">
                    <button
                      type="button"
                      className="billing-btn-cta"
                      disabled={busy}
                      onClick={handleNextFromPlans}
                    >
                      <span>{status.signedIn ? `Continue to Checkout (${selected.price})` : `Next: Enter Email (${selected.price})`}</span>
                      <ArrowRight size={16} />
                    </button>

                    <div className="billing-utility-chips">
                      <button
                        type="button"
                        className="billing-chip-btn"
                        disabled={busy}
                        onClick={() => setStep('gift')}
                      >
                        <Gift size={13} /> Redeem a gift code
                      </button>
                      <button
                        type="button"
                        className="billing-chip-btn"
                        disabled={busy}
                        onClick={() => {
                          if (status.signedIn) void activate()
                          else setStep('email')
                        }}
                      >
                        <Zap size={13} /> Activate Pro
                      </button>
                      <button
                        type="button"
                        className="billing-chip-btn"
                        disabled={busy}
                        onClick={handleStartTransfer}
                      >
                        <Laptop size={13} /> Transfer PC
                      </button>
                      {status.signedIn && (
                        <button
                          type="button"
                          className="billing-chip-btn"
                          disabled={busy}
                          onClick={manage}
                        >
                          <CreditCard size={13} /> Manage payments
                        </button>
                      )}
                    </div>

                    <div className="billing-trust-footnote">
                      <ShieldCheck size={13} />
                      <span>Official Paddle Checkout · Local Riot Session Vault</span>
                    </div>
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
                    <div className="billing-step-indicator">
                      <span>Step 2 of 2 · Verification</span>
                    </div>
                  </div>

                  <div className="billing-step2-layout">
                    {/* Left Column: Order / Intent Summary */}
                    <aside className={`billing-order-summary ${selected.cardTheme}`}>
                      <div className="billing-order-header">
                        <span className={`billing-order-badge ${selected.badge?.theme || 'amethyst'}`}>
                          {transfer ? 'TRANSFER LICENSE' : `${selected.title.toUpperCase()} PRO`}
                        </span>
                        <div className="billing-order-price-row">
                          <span className="billing-order-price">{transfer ? 'Free' : selected.price}</span>
                          <span className="billing-order-cadence">{transfer ? 'license move' : selected.cadence}</span>
                        </div>
                        <p className="billing-order-subtitle">
                          {transfer ? 'Move existing Pro activation' : selected.highlight}
                        </p>
                      </div>

                      <div className="billing-order-features">
                        <div className="billing-order-feature">
                          <Check size={12} className="billing-order-check" />
                          <span>Unlimited saved profiles</span>
                        </div>
                        <div className="billing-order-feature">
                          <Check size={12} className="billing-order-check" />
                          <span>Instant 1-click Riot switching</span>
                        </div>
                        <div className="billing-order-feature">
                          <Check size={12} className="billing-order-check" />
                          <span>Offline session vault</span>
                        </div>
                        <div className="billing-order-feature">
                          <Check size={12} className="billing-order-check" />
                          <span>{transfer ? 'Immediate transfer to this PC' : 'Paddle secure checkout'}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="billing-order-change-link"
                        disabled={busy}
                        onClick={() => { setStep('plans'); setTransfer(false) }}
                      >
                        Change plan
                      </button>
                    </aside>

                    {/* Right Column: Verification Form */}
                    <form className="billing-verify-form" onSubmit={(event) => { event.preventDefault(); verify() }}>
                      <div className="billing-form-head">
                        <div className="billing-form-icon">
                          <Mail size={18} />
                        </div>
                        <div>
                          <h3 className="billing-form-title">{transfer ? 'Transfer PC Activation' : 'Verify Billing Email'}</h3>
                          <p className="billing-form-desc">
                            {transfer
                              ? 'Enter the email used for your Pro license to send a 6-digit move authorization.'
                              : 'Enter your billing email to receive a 6-digit verification code.'}
                          </p>
                        </div>
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

                      <div className="billing-verify-foot">
                        <ShieldCheck size={12} />
                        <span>No password required · One-time passcode sent directly to your inbox</span>
                      </div>
                    </form>
                  </div>
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
                    <div className="billing-step-indicator">
                      <span>Gift & Promo</span>
                    </div>
                  </div>

                  <div className="billing-gift-card">
                    {/* Glowing Gift Emblem */}
                    <div className="billing-gift-emblem">
                      <Gift size={28} />
                    </div>

                    <div className="billing-gift-header">
                      <h3 className="billing-gift-title">Redeem Gift or Promo Code</h3>
                      <p className="billing-gift-desc">
                        Enter your 32-character code to unlock unlimited profiles and Pro features on this PC immediately.
                      </p>
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

                    {/* What Pro Unlocks Mini Cards */}
                    <div className="billing-gift-perks-row">
                      <div className="billing-gift-perk-pill">
                        <Check size={11} className="billing-perk-check" />
                        <span>Unlimited Profiles</span>
                      </div>
                      <div className="billing-gift-perk-pill">
                        <Check size={11} className="billing-perk-check" />
                        <span>Instant 1-Click Switching</span>
                      </div>
                      <div className="billing-gift-perk-pill">
                        <Check size={11} className="billing-perk-check" />
                        <span>Local Offline Vault</span>
                      </div>
                    </div>
                  </div>
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
                    className="billing-chip-btn"
                    style={{ marginTop: '6px' }}
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
