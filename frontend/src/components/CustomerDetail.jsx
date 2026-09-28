import { useEffect, useState } from 'react'
import { getCustomerDetail, updateContactStatus } from '../api.js'

function getRiskLevel(score) {
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

function ShapChart({ shapValues }) {
  if (!shapValues || shapValues.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No SHAP data available.</div>
  }

  const maxAbs = Math.max(...shapValues.map(s => Math.abs(s.impact)), 0.001)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
        <span>← Lowers churn risk</span>
        <span>Raises churn risk →</span>
      </div>
      {shapValues.map((s, i) => {
        const pct = (Math.abs(s.impact) / maxAbs) * 100
        const positive = s.impact > 0
        return (
          <div className="shap-bar-row" key={i}>
            <div className="shap-feature-name" title={s.feature}>{s.feature}</div>
            <div className="shap-bar-container">
              {positive ? (
                <>
                  <div style={{ flex: 1 }} />
                  <div
                    className="shap-bar positive"
                    style={{ width: `${pct / 2}%` }}
                  />
                </>
              ) : (
                <>
                  <div
                    className="shap-bar negative"
                    style={{ width: `${pct / 2}%`, marginLeft: 'auto' }}
                  />
                  <div style={{ flex: 1 }} />
                </>
              )}
            </div>
            <div className="shap-value" style={{ color: positive ? 'var(--risk-high)' : 'var(--risk-low)' }}>
              {positive ? '+' : ''}{s.impact.toFixed(3)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const STATUS_OPTIONS = ['not_contacted', 'contacted', 'converted', 'lost']

export default function CustomerDetail({ customerId, onClose, onStatusUpdated, isManager }) {
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statusLoading, setStatusLoading] = useState(false)
  const [localStatus, setLocalStatus] = useState(null)
  const [notes, setNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)

  useEffect(() => {
    setLoading(true)
    getCustomerDetail(customerId)
      .then(data => {
        setCustomer(data)
        setLocalStatus(data.contact_status)
        setNotes(data.contact_notes || '')
      })
      .finally(() => setLoading(false))
  }, [customerId])

  const handleStatusChange = async (newStatus) => {
    setLocalStatus(newStatus)
    setStatusLoading(true)
    try {
      await updateContactStatus(customerId, newStatus, notes)
      onStatusUpdated(customerId, newStatus)
    } finally {
      setStatusLoading(false)
    }
  }

  const handleSaveNotes = async () => {
    setStatusLoading(true)
    try {
      await updateContactStatus(customerId, localStatus, notes)
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    } finally {
      setStatusLoading(false)
    }
  }

  const level = customer ? getRiskLevel(customer.risk_score || 0) : 'low'

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <button
              id="close-drawer-btn"
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, padding: 0 }}
            >
              ×
            </button>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Customer Detail</h2>
          </div>
          {customer && (
            <div style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: 13 }}>
              ID: {customer.customer_id}
            </div>
          )}
        </div>

        <div className="drawer-body">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            </div>
          ) : customer ? (
            <>
              {/* Risk gauge */}
              <div className="risk-gauge-wrap">
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>
                    Churn Risk Score
                  </div>
                  <div className={`risk-gauge-score ${level}`}>
                    {customer.risk_score?.toFixed(1)}%
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ height: 12, background: 'var(--bg-base)', borderRadius: 99, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${customer.risk_score}%`,
                        borderRadius: 99,
                        background: level === 'high'
                          ? 'linear-gradient(90deg,#ff4d6d,#ff6b81)'
                          : level === 'medium'
                          ? 'linear-gradient(90deg,#ff9f43,#ffbe76)'
                          : 'linear-gradient(90deg,#20d489,#55efc4)',
                        transition: 'width 0.8s ease',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                    <span>0</span><span>50</span><span>100</span>
                  </div>
                </div>
              </div>

              {/* Key metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'Monthly Rev', value: customer.monthly_charges != null ? `$${customer.monthly_charges.toFixed(2)}` : '—' },
                  { label: 'Tenure', value: customer.tenure != null ? `${customer.tenure} mo` : '—' },
                  { label: 'Total Charges', value: customer.total_charges != null ? `$${customer.total_charges.toFixed(0)}` : '—' },
                ].map(m => (
                  <div key={m.label} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{m.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{m.value}</div>
                  </div>
                ))}
              </div>

              {/* Contact status */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Contact Status</div>
                  {isManager && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                      Read-only — manager view
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {STATUS_OPTIONS.map(s => (
                    <button
                      key={s}
                      id={`status-btn-${s}`}
                      className={`btn ${localStatus === s ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: 12, padding: '6px 14px', opacity: isManager ? 0.5 : 1, cursor: isManager ? 'default' : 'pointer' }}
                      onClick={() => !isManager && handleStatusChange(s)}
                      disabled={statusLoading || isManager}
                    >
                      {s.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                <div style={{ marginTop: 10 }}>
                  <label className="form-label">Notes</label>
                  <textarea
                    id="customer-notes-input"
                    className="form-input"
                    rows={3}
                    style={{ resize: 'vertical', opacity: isManager ? 0.6 : 1 }}
                    placeholder={isManager ? 'Notes are read-only for managers.' : 'Add notes about this customer…'}
                    value={notes}
                    onChange={e => !isManager && setNotes(e.target.value)}
                    readOnly={isManager}
                  />
                  {!isManager && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                      <button id="save-notes-btn" className="btn btn-secondary" style={{ fontSize: 12 }} onClick={handleSaveNotes}>
                        {notesSaved ? 'Saved' : 'Save Notes'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="divider" />

              {/* SHAP explanation */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Why is this customer at risk?</div>
                  <span className="chip-ai">SHAP</span>
                </div>
                <ShapChart shapValues={customer.shap_values} />
              </div>

              <div className="divider" />

              {/* Raw data */}
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', userSelect: 'none' }}>
                  Raw feature data
                </summary>
                <div style={{
                  marginTop: 10,
                  background: 'var(--bg-base)',
                  borderRadius: 'var(--radius-md)',
                  padding: 14,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: 'var(--text-secondary)',
                  maxHeight: 300,
                  overflow: 'auto',
                }}>
                  {Object.entries(customer.raw_data || {}).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--border)', padding: '4px 0' }}>
                      <span style={{ minWidth: 160, color: 'var(--text-muted)' }}>{k}</span>
                      <span>{String(v ?? '—')}</span>
                    </div>
                  ))}
                </div>
              </details>
            </>
          ) : (
            <div className="empty-state">Customer not found.</div>
          )}
        </div>
      </div>
    </>
  )
}
