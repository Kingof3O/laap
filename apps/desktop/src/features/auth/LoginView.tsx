import { useState, type FormEvent } from 'react'
import { LogIn, ShieldCheck } from 'lucide-react'

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
      <div className="login-box">
        <div className="login-crest" style={{ background: 'transparent', border: 'none', width: 'auto', height: 'auto' }}>
          <img
            src="/favicon.webp"
            alt="LAAP"
            style={{ width: '52px', height: '52px', borderRadius: '12px', boxShadow: '0 6px 20px rgba(0,0,0,0.6)' }}
          />
        </div>

        <h1 className="login-heading">Shared Pool</h1>
        <p className="login-caption">
          Sign in to access your shared account pool.
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="field-block">
            <label className="field-label">Email Address</label>
            <input
              type="email"
              className="hextech-input"
              placeholder="user@laap.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              required
            />
          </div>

          <div className="field-block">
            <label className="field-label">Password</label>
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
            <span>Remember me on this computer</span>
          </label>

          {error ? (
            <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'var(--status-danger-bg)', border: '1px solid var(--status-danger-border)', color: '#fca5a5', fontSize: '12px' }}>
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            className="btn-modal-primary"
            style={{ width: '100%', height: '36px', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            disabled={busy || !email || !password}
          >
            <LogIn size={14} />
            <span>{busy ? 'Authenticating…' : 'Sign In to Pool'}</span>
          </button>
        </form>
      </div>
    </div>
  )
}
