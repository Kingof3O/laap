import { useState } from 'react'
import { X } from 'lucide-react'
import { invokeTauri } from '../../lib/api'
import { useDialog } from '../../shared/hooks/useDialog'
import type { BillingStatus } from './useBilling'

const plans = [
  { id: 'monthly', label: '$3 monthly' },
  { id: 'yearly', label: '$20 yearly' },
  { id: 'lifetime', label: '$60 lifetime' },
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
      <div className="modal-panel" ref={dialog} role="dialog" aria-modal="true" aria-label="LAAP billing" tabIndex={-1}>
        <div className="modal-head">
          <h2 className="modal-title">LAAP {status.pro ? 'Pro' : 'Basic'}</h2>
          <button type="button" className="modal-close-btn" aria-label="Close billing" disabled={busy} onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body billing-body">
          <p>{status.pro ? 'Unlimited saved profiles are active on this computer.' : 'Basic includes two active profiles. Pro unlocks unlimited profiles on one computer.'}</p>
          {!status.pro && !status.signedIn && <p>$3 monthly · $20 yearly · $60 lifetime</p>}
          {status.pro && status.expiresAt && <p>Offline access through {new Date(status.expiresAt * 1000).toLocaleDateString()} unless renewed sooner.</p>}
          {(!status.signedIn || transfer) && (
            <form className="billing-fields" onSubmit={(event) => { event.preventDefault(); verify() }}>
              {transfer && <p>Get a fresh code for the billing email to move your activation.</p>}
              <label>Billing email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <button type="button" className="btn-secondary" onClick={sendCode} disabled={busy || !email.trim()}>Send email code</button>
              <label>Email code<input autoComplete="one-time-code" inputMode="numeric" maxLength={10} required value={code} onChange={(event) => setCode(event.target.value)} /></label>
              <button type="submit" className="btn-primary" disabled={busy || code.length < 6}>{transfer ? 'Confirm transfer' : 'Verify email'}</button>
              {transfer && <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setTransfer(false); setCode('') }}>Cancel transfer</button>}
            </form>
          )}
          {status.signedIn && !transfer && (
            <>
              {!status.pro && (
                <>
                  <div className="billing-actions">
                    {plans.map((plan) => <button key={plan.id} type="button" className="btn-primary" disabled={busy} onClick={() => void run(async () => {
                      await invokeTauri('billing_open_page', { plan: plan.id })
                      setMessage('After checkout, return here and select Activate Pro.')
                    })}>{plan.label}</button>)}
                  </div>
                  <div className="billing-actions">
                    <button type="button" className="btn-secondary" disabled={busy} onClick={() => void run(async () => {
                      onStatus(await invokeTauri<BillingStatus>('billing_activate'))
                    })}>Activate Pro</button>
                    <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setTransfer(true); setCode('') }}>Transfer activation</button>
                  </div>
                  <form className="billing-fields" onSubmit={(event) => {
                    event.preventDefault()
                    void run(async () => {
                      onStatus(await invokeTauri<BillingStatus>('billing_redeem', { code: gift }))
                      setGift('')
                    })
                  }}>
                    <label>Gift code<input maxLength={48} value={gift} onChange={(event) => setGift(event.target.value)} /></label>
                    <button type="submit" className="btn-secondary" disabled={busy || !gift.trim()}>Redeem gift code</button>
                  </form>
                </>
              )}
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => void run(() => invokeTauri('billing_open_page', { plan: null }))}>Manage payments</button>
            </>
          )}
          {status.pro && <button type="button" className="btn-secondary" disabled={busy} onClick={() => void run(async () => {
            onStatus(await invokeTauri<BillingStatus>('billing_status', { refresh: true, force: true }))
            setMessage('License checked.')
          })}>Check license</button>}
          {error && <p role="alert">{error}</p>}
          {error.includes('Close your pending checkout') && status.signedIn && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void run(async () => {
              await invokeTauri('billing_cancel_checkout')
              setMessage('Checkout closed. You can now redeem your gift code.')
            })}>Close pending checkout</button>
          )}
          {message && <p role="status">{message}</p>}
        </div>
      </div>
    </div>
  )
}
