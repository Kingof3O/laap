import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, CreditCard, ExternalLink, Gift, Laptop, LockKeyhole, RefreshCw, X } from 'lucide-react'
import { invokeTauri } from '../../lib/api'
import { useDialog } from '../../shared/hooks/useDialog'
import type { BillingStatus } from './useBilling'

const plans = [
  { id: 'monthly', title: 'Monthly', price: '$3', cadence: 'per month', detail: null },
  { id: 'yearly', title: 'Yearly', price: '$20', cadence: 'per year', detail: 'Save $16 compared with 12 monthly payments' },
  { id: 'lifetime', title: 'Lifetime', price: '$60', cadence: 'one-time', detail: null },
] as const

type PlanId = typeof plans[number]['id']
type Step = 'home' | 'verify' | 'checkout' | 'gift'
type Intent = 'purchase' | 'restore' | 'gift' | 'transfer' | 'manage'

const verificationCopy: Record<Intent, { title: string; action: string }> = {
  purchase: { title: 'Verify your billing email', action: 'Verify & open checkout' },
  restore: { title: 'Restore Pro access', action: 'Verify & restore Pro' },
  gift: { title: 'Verify to redeem your gift', action: 'Verify & redeem gift' },
  transfer: { title: 'Transfer Pro to this computer', action: 'Verify email' },
  manage: { title: 'Verify to manage billing', action: 'Verify & open billing' },
}

export function BillingModal({ status, onClose, onStatus }: {
  status: BillingStatus
  onClose: () => void
  onStatus: (status: BillingStatus) => void
}) {
  const [step, setStep] = useState<Step>('home')
  const [intent, setIntent] = useState<Intent>('purchase')
  const [plan, setPlan] = useState<PlanId>('yearly')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [challenge, setChallenge] = useState<{ email: string; transfer: boolean } | null>(null)
  const [gift, setGift] = useState('')
  const [checkoutOpened, setCheckoutOpened] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const inFlight = useRef(false)
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const codeInput = useRef<HTMLInputElement>(null)
  const dialog = useDialog(true, onClose, busy)
  const selected = plans.find((item) => item.id === plan)!
  const verifyCopy = verificationCopy[intent]

  useEffect(() => {
    if (step === 'verify' && challenge) codeInput.current?.focus()
    else stepHeading.current?.focus()
  }, [step, challenge])

  function clearFeedback() {
    setError('')
    setMessage('')
  }

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    clearFeedback()
    try {
      await action()
    } catch (cause) {
      setError(String(cause))
      const latest = await invokeTauri<BillingStatus>('billing_status', { refresh: false }).catch(() => null)
      if (latest) {
        onStatus(latest)
        if (!latest.signedIn && challenge?.transfer) {
          setChallenge(null)
          setCode('')
        }
      }
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  function openVerification(nextIntent: Intent) {
    clearFeedback()
    setIntent(nextIntent)
    setChallenge(null)
    setCode('')
    setStep('verify')
  }

  function goBack() {
    clearFeedback()
    setChallenge(null)
    setCode('')
    setStep(step === 'verify' && intent === 'gift' ? 'gift' : 'home')
  }

  async function activate() {
    const next = await invokeTauri<BillingStatus>('billing_activate')
    onStatus(next)
    if (next.pro) setStep('home')
    else setMessage('Pro access is still pending. If you just paid, try activating again in a moment.')
  }

  async function redeem() {
    const next = await invokeTauri<BillingStatus>('billing_redeem', { code: gift.trim() })
    onStatus(next)
    if (next.pro) {
      setGift('')
      setStep('home')
    } else setMessage('Pro is not active yet. Check your license status and try again.')
  }

  async function openCheckout() {
    setStep('checkout')
    await invokeTauri('billing_open_page', { plan })
    setCheckoutOpened(true)
  }

  const managePayments = () => invokeTauri<void>('billing_open_page', { plan: null })

  function start(intent: 'purchase' | 'restore' | 'manage') {
    if (!status.signedIn) {
      openVerification(intent)
      return
    }
    if (intent === 'purchase') {
      setCheckoutOpened(false)
      void run(openCheckout)
    } else {
      void run(intent === 'restore' ? activate : managePayments)
    }
  }

  function sendCode(address: string) {
    const transfer = intent === 'transfer' && status.signedIn
    void run(async () => {
      await invokeTauri('billing_send_code', { email: address })
      setCode('')
      setChallenge({ email: address, transfer })
      if (challenge) setMessage('A new code was sent.')
    })
  }

  function submitVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!challenge) {
      sendCode(email.trim())
      return
    }
    if (code.length < 6) return
    void run(async () => {
      if (challenge.transfer) {
        const next = await invokeTauri<BillingStatus>('billing_transfer', { email: challenge.email, code })
        onStatus(next)
        setChallenge(null)
        setCode('')
        setStep('home')
        setMessage('Activation transferred to this computer.')
        return
      }

      const next = await invokeTauri<BillingStatus>('billing_verify_email', { email: challenge.email, code })
      onStatus(next)
      setChallenge(null)
      setCode('')
      if (next.pro && (intent === 'purchase' || intent === 'restore' || intent === 'gift')) {
        setStep('home')
        return
      }
      if (intent === 'transfer') {
        setMessage('Email verified. Request a fresh code to authorize the device transfer.')
      } else if (intent === 'purchase') {
        setCheckoutOpened(false)
        await openCheckout()
      } else if (intent === 'gift') {
        setStep('gift')
        await redeem()
      } else {
        setStep('home')
        await (intent === 'restore' ? activate() : managePayments())
      }
    })
  }

  const headline = step === 'verify' ? verifyCopy.title
    : step === 'gift' ? 'Redeem a gift code'
    : step === 'checkout' ? 'Complete your upgrade'
    : status.pro ? 'LAAP Pro' : 'Choose your plan'

  return (
    <div className="modal-backdrop billing-backdrop">
      <div className="modal-panel billing-modal-panel" ref={dialog} role="dialog" aria-modal="true"
        aria-label="LAAP billing" aria-describedby="billing-step-title" tabIndex={-1}>
        <header className="billing-modal-head">
          <div className="billing-brand">
            <img src="/logo.webp" alt="LAAP" />
            <span className="billing-edition">Pro</span>
          </div>
          <button className="billing-close" type="button" aria-label="Close billing" disabled={busy} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="billing-modal-body" key={step}>
          {step !== 'home' ? (
            <button className="billing-link" type="button" disabled={busy} onClick={goBack}>
              <ArrowLeft size={15} aria-hidden="true" /> {step === 'verify' && intent === 'gift' ? 'Back to gift code' : status.pro ? 'Back to your license' : 'Back to plans'}
            </button>
          ) : null}
          <div className="billing-intro">
            <h2 id="billing-step-title" ref={stepHeading} tabIndex={-1}>{headline}</h2>
            {step === 'home' && status.pro ? <span className="billing-active"><Check size={13} aria-hidden="true" /> Active on this computer</span> : null}
          </div>

          {step === 'home' && !status.pro ? (
            <>
              <p className="billing-description">Keep all your Riot profiles active on one computer. Every plan includes the same Pro features.</p>
              <fieldset className="billing-plans" disabled={busy}>
                <legend className="visually-hidden">Billing plan</legend>
                {plans.map((item) => (
                  <label className="billing-plan" key={item.id}>
                    <input type="radio" name="laap-billing-plan" aria-label={`${item.price} ${item.title.toLowerCase()}`}
                      checked={plan === item.id} onChange={() => setPlan(item.id)} />
                    <span className="billing-plan-copy"><strong>{item.title}</strong>{item.detail ? <small>{item.detail}</small> : null}</span>
                    <span className="billing-price"><strong>{item.price}</strong><small>{item.cadence}</small></span>
                  </label>
                ))}
              </fieldset>
              <div className="billing-primary-actions">
                <button type="button" className="btn-modal-primary" disabled={busy} onClick={() => start('purchase')}>
                  {status.signedIn ? 'Open checkout' : 'Continue'} <ArrowRight size={15} aria-hidden="true" />
                </button>
                <span className="billing-muted"><LockKeyhole size={13} aria-hidden="true" /> USD pricing · Payment handled by Paddle</span>
              </div>
              <div className="billing-secondary">
                <button type="button" className="billing-link" disabled={busy} onClick={() => { clearFeedback(); setStep('gift') }}>
                  <Gift size={15} aria-hidden="true" /> Redeem a gift code
                </button>
                <details className="billing-existing">
                  <summary>Already have Pro? <ChevronDown size={15} aria-hidden="true" /></summary>
                  <div className="billing-existing-actions">
                    <button type="button" className="billing-link" disabled={busy} onClick={() => start('restore')}>
                      <RefreshCw size={13} aria-hidden="true" /> Restore Pro
                    </button>
                    <button type="button" className="billing-link" disabled={busy} onClick={() => openVerification('transfer')}>
                      <Laptop size={13} aria-hidden="true" /> Transfer PC
                    </button>
                    <button type="button" className="billing-link" disabled={busy} onClick={() => start('manage')}>
                      <CreditCard size={13} aria-hidden="true" /> Manage payments
                    </button>
                  </div>
                </details>
              </div>
            </>
          ) : null}

          {step === 'home' && status.pro ? (
            <>
              <p className="billing-description">Unlimited active profiles on this computer.</p>
              {status.expiresAt ? <div className="billing-summary">Offline access valid through <strong>{new Date(status.expiresAt * 1000).toLocaleDateString()}</strong></div> : null}
              <div className="billing-actions">
                <button type="button" className="btn-modal-primary" disabled={busy} onClick={() => start('manage')}>
                  <CreditCard size={15} aria-hidden="true" /> Manage payments
                </button>
                <button type="button" className="btn-modal-secondary" disabled={busy} onClick={() => void run(async () => {
                  onStatus(await invokeTauri<BillingStatus>('billing_status', { refresh: true, force: true }))
                  setMessage('License checked.')
                })}><RefreshCw size={15} aria-hidden="true" /> Check license</button>
                <button type="button" className="btn-modal-secondary" disabled={busy} onClick={() => openVerification('transfer')}>
                  <Laptop size={15} aria-hidden="true" /> Transfer PC
                </button>
              </div>
            </>
          ) : null}

          {(step === 'checkout' || (step === 'verify' && intent === 'purchase')) ? (
            <div className="billing-summary"><span>{selected.title} Pro</span><strong>{selected.price} {selected.cadence}</strong></div>
          ) : null}

          {step === 'verify' ? (
            <form className="billing-form" onSubmit={submitVerification}>
              {challenge ? (
                <>
                  <p className="billing-description" id="billing-code-instructions">Enter the code sent to <strong>{challenge.email}</strong>.</p>
                  <label className="billing-field">
                    Email code
                    <input ref={codeInput} className="hextech-input billing-code" type="text" autoComplete="one-time-code"
                      inputMode="numeric" aria-describedby="billing-code-instructions" required value={code} disabled={busy}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 10))} />
                  </label>
                  <div className="billing-actions">
                    <button type="submit" className="btn-modal-primary" disabled={busy || code.length < 6}>
                      {challenge.transfer ? 'Confirm transfer' : verifyCopy.action}
                    </button>
                    <button type="button" className="billing-link" disabled={busy} onClick={() => sendCode(challenge.email)}>Resend code</button>
                    <button type="button" className="billing-link" disabled={busy} onClick={() => {
                      clearFeedback()
                      setChallenge(null)
                      setCode('')
                    }}>Change email</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="billing-description">
                    {intent === 'transfer' && status.signedIn
                      ? 'Request a fresh authorization code using the email linked to your Pro license.'
                      : intent === 'transfer'
                        ? 'Sign in with your billing email first. A second code will authorize the move.'
                        : 'Enter your billing email to receive a one-time code.'}
                  </p>
                  <label className="billing-field">
                    Billing email
                    <input className="hextech-input" type="email" autoComplete="email" required placeholder="name@example.com"
                      value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} />
                  </label>
                  <button type="submit" className="btn-modal-primary" disabled={busy || !email.trim()}>Send email code</button>
                </>
              )}
            </form>
          ) : null}

          {step === 'checkout' ? (
            <>
              <p className="billing-description">{checkoutOpened
                ? 'Finish payment in your browser, then return here to activate Pro on this computer.'
                : 'Continue to Paddle in your browser to complete payment.'}</p>
              <div className="billing-actions">
                {status.signedIn ? (
                  checkoutOpened ? (
                    <>
                      <button type="button" className="btn-modal-primary" disabled={busy} onClick={() => void run(activate)}>Activate Pro</button>
                      <button type="button" className="billing-link" disabled={busy} onClick={() => void run(openCheckout)}>
                        Reopen checkout <ExternalLink size={14} aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn-modal-primary" disabled={busy} onClick={() => void run(openCheckout)}>
                      Open checkout <ExternalLink size={14} aria-hidden="true" />
                    </button>
                  )
                ) : (
                  <button type="button" className="btn-modal-primary" onClick={() => openVerification(checkoutOpened ? 'restore' : 'purchase')} disabled={busy}>Verify billing email</button>
                )}
              </div>
            </>
          ) : null}

          {step === 'gift' ? (
            <form className="billing-form" onSubmit={(event) => {
              event.preventDefault()
              if (!gift.trim()) return
              if (status.signedIn) void run(redeem)
              else openVerification('gift')
            }}>
              <p className="billing-description">Apply a gift code to activate Pro on this computer.</p>
              <label className="billing-field">
                Gift code
                <input className="hextech-input billing-code" required maxLength={48} placeholder="LAAP-XXXX-XXXX"
                  value={gift} disabled={busy} onChange={(event) => setGift(event.target.value)} />
              </label>
              <button type="submit" className="btn-modal-primary" disabled={busy || !gift.trim()}>
                {status.signedIn ? 'Redeem gift code' : 'Continue with email'}
              </button>
            </form>
          ) : null}

          {busy ? <p className="billing-muted" role="status">Working…</p> : null}
          {error ? <div className="billing-alert error" role="alert">
            <div>
              <p>{error}</p>
              {error.includes('Close your pending checkout') && status.signedIn ? (
                <button type="button" className="billing-link" disabled={busy} onClick={() => void run(async () => {
                  await invokeTauri('billing_cancel_checkout')
                  setCheckoutOpened(false)
                  setMessage('Pending checkout closed.')
                })}>Close pending checkout</button>
              ) : null}
            </div>
          </div> : null}
          {message ? <div className="billing-alert success" role="status"><CheckCircle2 size={15} aria-hidden="true" /><span>{message}</span></div> : null}
        </div>
      </div>
    </div>
  )
}
