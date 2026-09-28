export default function StatCards({ stats, loading, isManager }) {
  if (loading) {
    return (
      <div className="stat-cards">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="stat-card" style={{ opacity: 0.4 }}>
            <div className="stat-label">Loading…</div>
            <div className="stat-value">—</div>
          </div>
        ))}
      </div>
    )
  }

  if (!stats) return null

  const fmt = (n) => n?.toLocaleString('en-US') ?? '—'
  const fmtMoney = (n) => n != null ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'
  const fmtAuc = (n) => n ? n.toFixed(3) : '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {stats.assigned_agent_name && (
        <div style={{
          background: 'linear-gradient(to right, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))',
          padding: '20px',
          borderRadius: '12px',
          borderLeft: '4px solid #3b82f6',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.2)',
          display: 'flex',
          gap: '30px',
          alignItems: 'center'
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: '6px' }}>
              Agent Task Tracker
            </div>
            <div style={{ color: '#f8fafc', fontSize: '16px', fontWeight: 600 }}>
              {stats.assigned_agent_name}
            </div>
            {stats.assignment_note && (
              <div style={{ color: '#cbd5e1', fontSize: '13px', marginTop: '6px', fontStyle: 'italic' }}>
                "{stats.assignment_note}"
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '24px' }}>
            <div>
              <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Contact Progress</div>
              <div style={{ color: '#3b82f6', fontSize: '20px', fontWeight: 600 }}>
                {stats.contacted_count} <span style={{ fontSize: '14px', color: '#64748b' }}>/ {stats.target_quota ?? stats.total_customers}</span>
              </div>
            </div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Conversions</div>
              <div style={{ color: '#10b981', fontSize: '20px', fontWeight: 600 }}>
                {stats.converted_count}
              </div>
            </div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Task Completion</div>
              <div style={{ color: '#f8fafc', fontSize: '20px', fontWeight: 600 }}>
                {(() => { const denom = stats.target_quota || stats.total_customers; return denom > 0 ? Math.round((stats.contacted_count / denom) * 100) : 0 })()}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI cards — manager only */}
      {isManager && (
      <div className="stat-cards">
      <div className="stat-card total">
        <div className="stat-label">Total Customers</div>
        <div className="stat-value total">{fmt(stats.total_customers)}</div>
        <div className="stat-sub">in this session</div>
      </div>

      <div className="stat-card high">
        <div className="stat-label">High Risk</div>
        <div className="stat-value high">{fmt(stats.high_risk_count)}</div>
        <div className="stat-sub">score ≥ 70</div>
      </div>

      <div className="stat-card medium">
        <div className="stat-label">Medium Risk</div>
        <div className="stat-value medium">{fmt(stats.medium_risk_count)}</div>
        <div className="stat-sub">score 40–69</div>
      </div>

      <div className="stat-card revenue massive-card">
        <div className="stat-label" style={{ color: '#ffb84d' }}>Revenue at Risk</div>
        <div className="stat-value revenue">{fmtMoney(stats.revenue_at_risk)}</div>
        <div className="stat-sub">monthly from high-risk</div>
      </div>

      <div className="stat-card revenue massive-card success">
        <div className="stat-label">Revenue Saved</div>
        <div className="stat-value">{fmtMoney(stats.revenue_saved)}</div>
        <div className="stat-sub">from converted customers</div>
      </div>

      <div className="stat-card auc">
        <div className="stat-label">Model AUC</div>
        <div className="stat-value auc">{fmtAuc(stats.model_auc)}</div>
        <div className="stat-sub">XGBoost classifier</div>
      </div>
    </div>
      )}
    </div>
  )
}
