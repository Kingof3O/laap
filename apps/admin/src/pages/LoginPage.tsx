import { useState, type FormEvent } from 'react'
import { ArrowRight, KeyRound } from 'lucide-react'
import { GlassCard } from '../components/GlassCard'

type LoginPageProps = { onSubmit: (email: string, password: string) => Promise<void>; error: string | null; demoAvailable: boolean }

export function LoginPage({ onSubmit, error, demoAvailable }: LoginPageProps) {
  const [email, setEmail] = useState(import.meta.env.DEV ? 'admin@laap.local' : '')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSubmitting(true); try { await onSubmit(email, password) } finally { setSubmitting(false) } }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-canvas lg:grid lg:grid-cols-2">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <section className="relative flex min-h-[38dvh] items-end overflow-hidden border-b border-white/[0.07] px-6 py-9 sm:px-10 sm:py-12 lg:min-h-dvh lg:items-center lg:border-b-0 lg:border-r lg:px-14 xl:px-20">
        <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" aria-hidden="true" />
        <div className="absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-cyan-300/10 blur-3xl" aria-hidden="true" />
        <div className="relative w-full max-w-xl">
          <img src="/logo.webp" alt="LAAP" className="h-16 w-auto max-w-sm sm:h-20 lg:h-24 object-contain" />
          <div className="mt-7 max-w-md sm:mt-10 lg:mt-12"><p className="text-lg font-medium tracking-[-0.02em] text-slate-200 sm:text-xl">Account access, made simple.</p><p className="mt-3 text-sm leading-6 text-slate-500 sm:text-base">Keep your team moving with one clear place to manage accounts and sessions.</p></div>
          <div className="mt-8 hidden items-center gap-2 text-[11px] text-slate-600 lg:flex"><span className="h-px w-8 bg-amber-400/30" />Built for focused teams</div>
        </div>
      </section>
      <section className="relative flex min-h-[62dvh] items-center justify-center px-5 py-10 sm:px-8 lg:min-h-dvh lg:px-12">
        <GlassCard className="w-full max-w-[410px] p-6 sm:p-8" as="section">
          <div>
            <img src="/favicon.webp" alt="LAAP" className="mb-5 h-12 w-12 rounded-xl shadow-xl" />
            <p className="eyebrow">Sign in</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-slate-100">Welcome back.</h1><p className="mt-3 text-sm leading-6 text-slate-400">Continue to your LAAP workspace.</p></div>
          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div><label className="mb-2 block text-xs font-medium text-slate-300" htmlFor="email">Email</label><input id="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input-base h-12 w-full px-3 text-sm" type="email" autoComplete="username" required /></div>
            <div><label className="mb-2 block text-xs font-medium text-slate-300" htmlFor="password">Password</label><div className="relative"><KeyRound aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={15} /><input id="password" value={password} onChange={(event) => setPassword(event.target.value)} className="input-base h-12 w-full px-3 pl-9 text-sm" type="password" autoComplete="current-password" required /></div></div>
            {error ? <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2.5 text-xs text-rose-200" role="alert">{error}</p> : null}
            <button type="submit" disabled={submitting} className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80">{submitting ? 'Signing in…' : 'Sign in'}{!submitting ? <ArrowRight aria-hidden="true" size={16} /> : null}</button>
          </form>
          {demoAvailable ? <p className="mt-5 text-center text-[11px] leading-5 text-slate-600">Demo sign-in is available only during local development.</p> : null}
        </GlassCard>
      </section>
    </div>
  )
}
