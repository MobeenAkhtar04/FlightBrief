import { useState, FormEvent } from 'react'

interface Props {
  onLogin: (username: string, password: string) => Promise<void>
  onRegister: (username: string, password: string) => Promise<void>
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-input)',
  borderRadius: 6,
  padding: '8px 12px',
  color: 'var(--text-primary)',
  fontFamily: '"Courier New", monospace',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
}

export default function Login({ onLogin, onRegister }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        await onLogin(username, password)
      } else {
        await onRegister(username, password)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-page)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>✈</div>
        <div style={{ fontWeight: 700, letterSpacing: '0.18em', fontSize: 15, color: 'var(--text-primary)' }}>
          FLIGHTBRIEF
        </div>
        <div className="label" style={{ marginTop: 4 }}>PRE-FLIGHT BRIEFING</div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="card"
        style={{ width: '100%', maxWidth: 360, padding: '24px 24px 20px' }}
      >
        <div className="label" style={{ marginBottom: 16 }}>
          {mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <div>
            <div className="label" style={{ marginBottom: 5 }}>USERNAME</div>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              required
              minLength={3}
              style={inputStyle}
            />
          </div>
          <div>
            <div className="label" style={{ marginBottom: 5 }}>PASSWORD</div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={8}
              style={inputStyle}
            />
            {mode === 'register' && (
              <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 4 }}>
                minimum 8 characters
              </div>
            )}
          </div>
        </div>

        {error && (
          <div style={{
            marginBottom: 12,
            padding: '8px 12px',
            borderRadius: 6,
            background: 'var(--red-bg)',
            border: '1px solid var(--red-border)',
            color: 'var(--red)',
            fontSize: 11,
            fontFamily: '"Courier New", monospace',
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '9px 0',
            background: loading ? 'var(--border-card)' : 'var(--blue)',
            color: loading ? 'var(--text-subtle)' : '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: '"Courier New", monospace',
            fontSize: 11,
            letterSpacing: '0.12em',
            fontWeight: 700,
          }}
        >
          {loading ? 'PLEASE WAIT...' : mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
        </button>

        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontFamily: '"Courier New", monospace',
              fontSize: 10,
              letterSpacing: '0.08em',
            }}
          >
            {mode === 'login' ? 'no account? register' : 'already have an account? sign in'}
          </button>
        </div>
      </form>
    </div>
  )
}
