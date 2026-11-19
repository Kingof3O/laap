import { useState, type FormEvent } from 'react'
import { ArrowRight, KeyRound, Mail, RefreshCw, ShieldCheck } from 'lucide-react'
import { GlassCard } from '../components/GlassCard'

type LoginPageProps = {
  onSuccess: () => Promise<void>
  onSendCode: (email: string) => Promise<void>
  onVerifyCode: (email: string, code: string) => Promise<void>
  error: string | null
}

export function LoginPage({ onSuccess, onSendCode, onVerifyCode, error }: LoginPageProps) {
  const [email, setEmail] = useState(() => localStorage.getItem('laap_admin_email') || 'hussiensalah100@gmail.com')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [sentMessage, setSentMessage] = useState(false)

  const handleSendCode = async (event?: FormEvent) => {
    if (event) event.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    setLocalError(null)
    try {
      localStorage.setItem('laap_admin_email', email)
      await onSendCode(email.trim())
      setStep('code')
      setSentMessage(true)
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'Could not send verification code.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleVerifyCode = async (event: FormEvent) => {
    event.preventDefault()
    if (!code.trim()) return
    setSubmitting(true)
    setLocalError(null)
    try {
      await onVerifyCode(email.trim(), code.trim())
      await onSuccess()
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'Invalid or expired code. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const displayError = localError || error

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-canvas lg:grid lg:grid-cols-2">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <section className="relative flex min-h-[38dvh] items-end overflow-hidden border-b border-white/[0.07] px-6 py-9 sm:px-10 sm:py-12 lg:min-h-dvh lg:items-center lg:border-b-0 lg:border-r lg:px-14 xl:px-20">
        <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" aria-hidden="true" />
        <div className="absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-cyan-300/10 blur-3xl" aria-hidden="true" />
        <div className="relative w-full max-w-xl">
          <img src="/logo.webp" alt="LAAP" className="h-16 w-auto max-w-sm sm:h-20 lg:h-24 object-contain" />
          <div className="mt-7 max-w-md sm:mt-10 lg:mt-12">
            <p className="text-lg font-medium tracking-[-0.02em] text-slate-200 sm:text-xl">LAAP Operations & Billing</p>
            <p className="mt-3 text-sm leading-6 text-slate-400 sm:text-base">
              Authorized owner access for subscription management, gift codes, and hardware device overrides.
            </p>
          </div>
          <div className="mt-8 flex items-center gap-2 text-[11px] text-slate-500">
            <ShieldCheck aria-hidden="true" size={14} className="text-emerald-400" />
            <span>Protected by Supabase Auth & Cloudflare Edge Verification</span>
          </div>
        </div>
      </section>

      <section className="relative flex min-h-[62dvh] items-center justify-center px-5 py-10 sm:px-8 lg:min-h-dvh lg:px-12">
        <GlassCard className="w-full max-w-[420px] p-6 sm:p-8" as="section">
          <div>
            <img src="/favicon.webp" alt="LAAP" className="mb-5 h-12 w-12 rounded-xl shadow-xl" />
            <p className="eyebrow">Owner sign in</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-slate-100 sm:text-3xl">
              {step === 'email' ? 'Welcome back.' : 'Check your inbox.'}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              {step === 'email'
                ? 'Enter your verified owner email to receive a one-time sign-in code.'
                : `We sent a 6-digit code to ${email}.`}
            </p>
          </div>

          {step === 'email' ? (
            <form className="mt-8 space-y-5" onSubmit={handleSendCode}>
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-300" htmlFor="email">
                  Owner Email
                </label>
                <div className="relative">
                  <Mail aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    id="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="input-base h-12 w-full px-3 pl-9 text-sm"
                    type="email"
                    autoComplete="username"
                    required
                    placeholder="name@example.com"
                  />
                </div>
              </div>

              {displayError ? (
                <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2.5 text-xs text-rose-200" role="alert">
                  {displayError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting || !email.trim()}
                className="btn-primary flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium transition"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Sending code...</span>
                  </>
                ) : (
                  <>
                    <span>Send sign-in code</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form className="mt-8 space-y-5" onSubmit={handleVerifyCode}>
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-300" htmlFor="code">
                  6-Digit Verification Code
                </label>
                <div className="relative">
                  <KeyRound aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    id="code"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\s+/g, ''))}
                    className="input-base h-12 w-full px-3 pl-9 font-mono text-base tracking-widest"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    maxLength={8}
                    placeholder="123456"
                    autoFocus
                  />
                </div>
              </div>

              {sentMessage ? (
                <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                  Code sent! Check your inbox or spam folder.
                </p>
              ) : null}

              {displayError ? (
                <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2.5 text-xs text-rose-200" role="alert">
                  {displayError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting || !code.trim()}
                className="btn-primary flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium transition"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>Sign in to Dashboard</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between pt-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setStep('email')
                    setCode('')
                    setLocalError(null)
                  }}
                  className="text-slate-400 hover:text-slate-200 underline underline-offset-4"
                >
                  Use a different email
                </button>
                <button
                  type="button"
                  onClick={() => handleSendCode()}
                  disabled={submitting}
                  className="text-cyan-400 hover:text-cyan-300"
                >
                  Resend code
                </button>
              </div>
            </form>
          )}
        </GlassCard>
      </section>
    </div>
  )
}
