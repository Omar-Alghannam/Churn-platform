import { useState } from 'react'
import { loginUser, registerUser } from '../api.js'

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('manager') // 'manager' | 'sales_agent'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (isRegister) {
        if (!name.trim()) throw new Error('Name is required.')
        const res = await registerUser({ email, name, password, role })
        onAuthSuccess(res.user)
      } else {
        const res = await loginUser(email, password)
        onAuthSuccess(res.user)
      }
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Authentication failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickLogin = async (demoEmail, demoRole, demoName) => {
    setLoading(true)
    setError(null)
    try {
      const res = await loginUser(demoEmail, 'demo123')
      onAuthSuccess(res.user)
      onClose()
    } catch (err) {
      setError('Quick login failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal auth-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isRegister ? 'Create Account' : 'Sign In to Churn Intelligence'}
        </div>
        <div className="modal-sub">
          {isRegister
            ? 'Set up your retention manager or sales agent workspace.'
            : 'Access your team dashboard, assigned customer queues, and alerts.'}
        </div>

        {/* 1-Click Demo Accounts */}
        <div className="quick-login-box">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
            1-Click Fast Switch:
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '5px 10px' }}
              onClick={() => handleQuickLogin('manager@telecom.com', 'manager', 'Retention Director')}
            >
              Manager View
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '5px 10px' }}
              onClick={() => handleQuickLogin('agent@telecom.com', 'sales_agent', 'Sales Agent')}
            >
              Sales Agent View
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '5px 10px' }}
              onClick={() => handleQuickLogin('oaa5429946@gmail.com', 'sales_agent', 'Omar (Agent)')}
            >
              Omar
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, margin: '14px 0 10px' }}>
          — or enter credentials —
        </div>

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
                <label className="form-label">Workspace Role *</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="role"
                      value="manager"
                      checked={role === 'manager'}
                      onChange={() => setRole('manager')}
                    />
                    Retention Manager
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="role"
                      value="sales_agent"
                      checked={role === 'sales_agent'}
                      onChange={() => setRole('sales_agent')}
                    />
                    Sales / Retention Agent
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
              placeholder="e.g. oaa5429946@gmail.com"
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

          {error && <div className="alert error" style={{ margin: '10px 0' }}>{error}</div>}

          <div className="modal-actions" style={{ marginTop: 18 }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setIsRegister(!isRegister); setError(null) }}
            >
              {isRegister ? 'Already have an account? Sign In' : 'Need an account? Register'}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !email.trim() || !password}
            >
              {loading ? <span className="spinner" /> : (isRegister ? 'Create Account' : 'Sign In')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
