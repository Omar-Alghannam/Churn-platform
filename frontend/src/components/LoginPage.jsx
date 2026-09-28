import { useState } from 'react'
import { loginUser, registerUser } from '../api.js'

export default function LoginPage({ onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('manager') // 'manager' | 'sales_agent'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (isRegister) {
        if (!name.trim()) throw new Error('Name is required.')
        const res = await registerUser({ email, name, password, role })
        onLoginSuccess(res.user)
      } else {
        const res = await loginUser(email, password)
        onLoginSuccess(res.user)
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickPortal = async (userEmail) => {
    setLoading(true)
    setError(null)
    try {
      const res = await loginUser(userEmail, 'demo123')
      onLoginSuccess(res.user)
    } catch (err) {
      setError('Portal login failed.')
    } finally {
      setLoading(false)
    }
  }

  const MOCK_ACCOUNTS = [
    { name: 'Sarah Jenkins', email: 'sarah.director@telecom.com', role: 'manager', label: 'Director' },
    { name: 'Marcus Vance', email: 'marcus.lead@telecom.com', role: 'manager', label: 'Lead' },
    { name: 'Alex Morgan', email: 'alex.agent@telecom.com', role: 'agent', label: 'Agent' },
    { name: 'Elena Rostova', email: 'elena.agent@telecom.com', role: 'agent', label: 'Agent' },
    { name: 'David Kim', email: 'david.agent@telecom.com', role: 'agent', label: 'Agent' },
    { name: 'Priya Patel', email: 'priya.agent@telecom.com', role: 'agent', label: 'Agent' },
    { name: 'Omar Al-Sayed', email: 'omar.agent@telecom.com', role: 'agent', label: 'Agent' },
  ]

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at top, #1e293b 0%, #090d16 100%)',
      padding: 20
    }}>
      <div style={{
        width: '100%',
        maxWidth: 480,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '36px 32px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      }}>
        {/* Logo & Title */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            fontSize: 26,
            fontWeight: 800,
            background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.5px',
            marginBottom: 6
          }}>
            Churn Intelligence Platform
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Enterprise Customer Retention & Predictive Analytics
          </div>
        </div>

        {/* 1-Click Fast Portal Switch */}
        <div style={{
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-md)',
          padding: 14,
          border: '1px solid var(--border)',
          marginBottom: 20
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            1-Click Mock Portals:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '10px 8px', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}
              onClick={() => handleQuickPortal('sarah.director@telecom.com')}
              disabled={loading}
            >
              <strong style={{ color: 'var(--accent)' }}>Sarah Jenkins</strong>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Retention Director</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '10px 8px', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}
              onClick={() => handleQuickPortal('alex.agent@telecom.com')}
              disabled={loading}
            >
              <strong style={{ color: '#20d489' }}>Alex Morgan</strong>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Senior Specialist</span>
            </button>
          </div>

          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', fontWeight: 600 }}>
            Or switch to any mock user:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {MOCK_ACCOUNTS.map(acc => (
              <button
                key={acc.email}
                type="button"
                onClick={() => handleQuickPortal(acc.email)}
                disabled={loading}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '3px 8px',
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {acc.name.split(' ')[0]} ({acc.label})
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: 'var(--text-muted)', fontSize: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ padding: '0 12px' }}>or sign in with credentials</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit}>
          {isRegister && (
            <>
              <div className="form-field">
                <label className="form-label">Full Name *</label>
                <input
                  className="form-input"
                  placeholder="e.g. Sarah Connor"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label className="form-label">Account Role *</label>
                <div style={{ display: 'flex', gap: 14 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="login-role"
                      value="manager"
                      checked={role === 'manager'}
                      onChange={() => setRole('manager')}
                    />
                    Manager
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="login-role"
                      value="sales_agent"
                      checked={role === 'sales_agent'}
                      onChange={() => setRole('sales_agent')}
                    />
                    Retention Agent
                  </label>
                </div>
              </div>
            </>
          )}

          <div className="form-field">
            <label className="form-label">Email Address *</label>
            <input
              type="email"
              className="form-input"
              placeholder="e.g. user@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label className="form-label">Password *</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className="alert error" style={{ margin: '12px 0' }}>{error}</div>}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 600, marginTop: 16 }}
            disabled={loading || !email.trim() || !password}
          >
            {loading ? <span className="spinner" /> : (isRegister ? 'Create Account' : 'Sign In')}
          </button>

          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              onClick={() => { setIsRegister(!isRegister); setError(null) }}
            >
              {isRegister ? 'Already have an account? Sign In' : 'New user? Create an account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
