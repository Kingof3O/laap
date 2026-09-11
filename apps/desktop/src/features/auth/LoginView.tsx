import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, LogIn } from 'lucide-react'

interface LoginViewProps {
  onLogin: (email: string, pass: string, remember: boolean) => Promise<void>
  busy: boolean
  error: string | null
}

export function LoginView({ onLogin, busy, error }: LoginViewProps) {
  const [email, setEmail] = useState(() => localStorage.getItem('laap_desktop_email') || '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email || !password || busy) return
    localStorage.setItem('laap_desktop_email', email)
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

        <h1 className="login-heading">Shared Accounts</h1>
        <p className="login-caption">
          Sign in to access accounts shared with you.
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="field-block">
            <label className="field-label">Email Address</label>
            <input
              type="email"
              className="hextech-input"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              required
            />
          </div>

          <div className="field-block">
            <label className="field-label">Password</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="hextech-input"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                style={{ paddingRight: '36px' }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={busy}
                style={{
                  position: 'absolute',
                  right: '10px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary, #94a3b8)',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={busy}
            />
            <span>Keep me signed in</span>
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
            <span>{busy ? 'Signing in…' : 'Sign In'}</span>
          </button>
        </form>
      </div>
    </div>
  )
}
