import { useState, type FormEvent } from 'react'
import { LogIn, ShieldCheck, Zap } from 'lucide-react'

interface LoginViewProps {
  onLogin: (email: string, pass: string, remember: boolean) => Promise<void>
  busy: boolean
  error: string | null
}

export function LoginView({ onLogin, busy, error }: LoginViewProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email || !password || busy) return
    await onLogin(email, password, rememberMe)
  }

  return (
    <div className="login-stage">
      <div className="hextech-card login-box">
        {/* Hextech Corner Ornaments */}
        <div className="corner-accent corner-tl" />
        <div className="corner-accent corner-tr" />
        <div className="corner-accent corner-bl" />
        <div className="corner-accent corner-br" />

        <div className="login-crest">
          <ShieldCheck size={26} />
        </div>

        <h1 className="login-heading">TEAM VAULT</h1>
        <p className="login-caption">
          Sign in with your team credentials to unlock shared League profiles.
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="field-block">
            <label className="field-label">EMAIL ADDRESS</label>
            <input
              type="email"
              className="hextech-input"
              placeholder="summoner@team.gg"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              required
            />
          </div>

          <div className="field-block">
            <label className="field-label">PASSWORD</label>
            <input
              type="password"
              className="hextech-input"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              required
            />
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={busy}
            />
            <span>Remember me on this PC</span>
          </label>

          {error ? (
            <div className="login-error-pill">
              <span>{error}</span>
            </div>
          ) : null}

          <button
            type="submit"
            className="btn-hextech-submit"
            disabled={busy || !email || !password}
          >
            <LogIn size={15} />
            <span>{busy ? 'AUTHENTICATING…' : 'SIGN IN TO VAULT'}</span>
          </button>
        </form>
      </div>
    </div>
  )
}
