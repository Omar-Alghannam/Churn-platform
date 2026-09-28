import { useState } from 'react'
import { updateContactStatus, updateBulkContactStatus, generateBulkCampaign } from '../api.js'

const RISK_LEVELS = {
  high: { label: 'High', className: 'high', min: 70 },
  medium: { label: 'Medium', className: 'medium', min: 40 },
  low: { label: 'Low', className: 'low', min: 0 },
}

function getRiskLevel(score) {
  const s = Number(score) || 0
  // Handle both 0-1 decimal probabilities and 0-100 percentage scores
  const normalized = (s > 0 && s <= 1) ? s * 100 : s
  if (normalized >= 70) return 'high'
  if (normalized >= 40) return 'medium'
  return 'low'
}

function RiskBar({ score }) {
  const level = getRiskLevel(score)
  const displayScore = (score > 0 && score <= 1) ? score * 100 : (score || 0)
  return (
    <div className="risk-bar-wrap">
      <div className="risk-bar-track">
        <div
          className={`risk-bar-fill ${level}`}
          style={{ width: `${Math.min(100, Math.max(0, displayScore))}%` }}
        />
      </div>
      <span className={`risk-badge ${level}`}>{displayScore.toFixed(0)}%</span>
    </div>
  )
}

const STATUS_OPTIONS = ['not_contacted', 'contacted', 'converted', 'lost']
const STATUS_DOTS = {
  not_contacted: 'var(--status-not)',
  contacted: 'var(--status-contacted)',
  converted: 'var(--status-converted)',
  lost: 'var(--status-lost)',
}

export default function CustomerTable({ customers, stats, loading, onRowClick, onStatusUpdated, onOpenAddCustomer, isManager }) {
  const [sortBy, setSortBy] = useState('risk_score')
  const [sortDir, setSortDir] = useState('desc')
  const [filterRisk, setFilterRisk] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [updatingId, setUpdatingId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [campaignLoading, setCampaignLoading] = useState(false)
  const [campaignResult, setCampaignResult] = useState(null)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const sorted = [...customers]
    .filter(c => {
      // Risk level filter (matches backend stats)
      if (filterRisk && getRiskLevel(c.risk_score) !== filterRisk) return false

      // Status filter
      if (filterStatus && c.contact_status !== filterStatus) return false

      // Search (matches customer ID or raw data attributes)
      if (search.trim()) {
        const query = search.trim().toLowerCase()
        const matchId = String(c.customer_id || '').toLowerCase().includes(query)
        const matchContract = String(c.raw_data?.Contract || '').toLowerCase().includes(query)
        const matchInternet = String(c.raw_data?.InternetService || '').toLowerCase().includes(query)
        if (!matchId && !matchContract && !matchInternet) return false
      }
      return true
    })
    .sort((a, b) => {
      let av = a[sortBy] ?? 0
      let bv = b[sortBy] ?? 0
      if (sortBy === 'financial_risk') {
        const aRisk = (a.risk_score > 0 && a.risk_score <= 1) ? a.risk_score : (a.risk_score || 0) / 100
        const bRisk = (b.risk_score > 0 && b.risk_score <= 1) ? b.risk_score : (b.risk_score || 0) / 100
        av = aRisk * (a.monthly_charges || 0)
        bv = bRisk * (b.monthly_charges || 0)
      }
      return sortDir === 'desc' ? bv - av : av - bv
    })

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const clearFilters = () => {
    setSearch('')
    setFilterRisk('')
    setFilterStatus('')
    setPage(0)
  }

  const hasActiveFilters = search || filterRisk || filterStatus

  const SortIcon = ({ col }) => (
    <span style={{ marginLeft: 4, opacity: sortBy === col ? 1 : 0.3 }}>
      {sortBy === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  )

  const handleStatusChange = async (e, customerId) => {
    e.stopPropagation()
    const newStatus = e.target.value
    setUpdatingId(customerId)
    try {
      await updateContactStatus(customerId, newStatus, null)
      onStatusUpdated(customerId, newStatus)
    } finally {
      setUpdatingId(null)
    }
  }

  const toggleSelect = (e, id) => {
    e.stopPropagation()
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const toggleSelectAll = (e) => {
    e.stopPropagation()
    if (selectedIds.size === sorted.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sorted.map(c => c.id)))
    }
  }

  const handleGenerateCampaign = async () => {
    if (selectedIds.size === 0) return
    setCampaignLoading(true)
    try {
      const res = await generateBulkCampaign(Array.from(selectedIds))
      setCampaignResult(res.email_draft)
    } catch (err) {
      console.error(err)
      if (err.response) {
        alert(`Failed to generate campaign: ${err.response.status} - ${JSON.stringify(err.response.data)}`)
      } else {
        alert(`Failed to generate campaign: ${err.message}`)
      }
    } finally {
      setCampaignLoading(false)
    }
  }

  const handleBulkStatusChange = async (e) => {
    const status = e.target.value
    if (!status || selectedIds.size === 0) return
    setCampaignLoading(true) // reuse loading state
    try {
      const idsArray = Array.from(selectedIds)
      await updateBulkContactStatus(idsArray, status)
      
      // Update local state and clear selection
      idsArray.forEach(id => {
        const c = customers.find(x => x.id === id)
        if (c) c.contact_status = status
      })
      setSelectedIds(new Set())
      if (onStatusUpdated) onStatusUpdated() // Trigger stats refresh
    } catch (err) {
      console.error(err)
      alert("Failed to update status")
    } finally {
      setCampaignLoading(false)
      e.target.value = "" // Reset dropdown
    }
  }

  if (loading) {
    return (
      <div className="table-wrap">
        <div className="empty-state">
          <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
          <div>Loading customers…</div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Quick Filter Presets & Filters Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Quick Presets:</span>
        <button
          className={`btn ${filterRisk === 'high' && filterStatus === 'not_contacted' ? 'btn-secondary' : 'btn-ghost'}`}
          style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={() => { setFilterRisk('high'); setFilterStatus('not_contacted'); }}
        >
          Urgent: High Risk & Uncontacted
        </button>
        <button
          className={`btn ${filterRisk === 'high' ? 'btn-secondary' : 'btn-ghost'}`}
          style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={() => { setFilterRisk('high'); setFilterStatus(''); }}
        >
          All High Risk
        </button>
        <button
          className={`btn ${filterStatus === 'contacted' ? 'btn-secondary' : 'btn-ghost'}`}
          style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={() => { setFilterRisk(''); setFilterStatus('contacted'); }}
        >
          In Progress (Contacted)
        </button>
        {hasActiveFilters && (
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: '4px 10px', color: 'var(--risk-high)' }}
            onClick={clearFilters}
          >
            ✕ Reset Filters
          </button>
        )}

        {/* Quota Progress Pill (if assigned) */}
        {stats?.target_quota && (
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 10px',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--accent-dim)',
              fontSize: 12,
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>Target Quota:</span>
            <strong style={{ color: 'var(--accent)' }}>
              {stats.contacted_count || 0} / {stats.target_quota}
            </strong>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              ({Math.round(((stats.contacted_count || 0) / stats.target_quota) * 100)}%)
            </span>
          </div>
        )}

        {/* + Add Customer Button */}
        <button
          className="btn btn-primary"
          style={{
            marginLeft: stats?.target_quota ? 8 : 'auto',
            fontSize: 12,
            padding: '5px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontWeight: 600,
          }}
          onClick={onOpenAddCustomer}
        >
          <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Add Customer
        </button>
      </div>

      <div className="filter-bar">
        <input
          id="customer-search"
          className="filter-input"
          placeholder="Search ID, Contract, Service..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <select id="filter-risk" className="filter-select" value={filterRisk} onChange={e => setFilterRisk(e.target.value)}>
          <option value="">All Risk Levels ({customers.length})</option>
          <option value="high">High (≥70) {stats ? `[${stats.high_risk_count}]` : ''}</option>
          <option value="medium">Medium (40–69) {stats ? `[${stats.medium_risk_count}]` : ''}</option>
          <option value="low">Low (&lt;40) {stats ? `[${stats.low_risk_count}]` : ''}</option>
        </select>
        <select id="filter-status" className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Status: All</option>
          <option value="not_contacted">Not Contacted</option>
          <option value="contacted">Contacted</option>
          <option value="converted">Converted</option>
          <option value="lost">Lost</option>
        </select>
        <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 'auto' }}>
          Page {page + 1}/{totalPages || 1} · Showing <strong>{paged.length}</strong> of {sorted.length} customers
        </span>
        {selectedIds.size > 0 && (
          <div style={{ display: 'flex', gap: 8, marginLeft: 16 }}>
            <select
              className="filter-select"
              onChange={handleBulkStatusChange}
              value=""
              disabled={campaignLoading}
              style={{ fontSize: 13, padding: '4px 8px', background: 'var(--bg-glass)', color: 'var(--text-primary)' }}
            >
              <option value="" disabled>Mark Selected As...</option>
              <option value="not_contacted">Not Contacted</option>
              <option value="contacted">Contacted</option>
              <option value="converted">Converted</option>
              <option value="lost">Lost</option>
            </select>
            {isManager && (
              <button
                className="btn btn-primary"
                style={{ fontSize: 13, padding: '6px 12px' }}
                onClick={handleGenerateCampaign}
                disabled={campaignLoading}
              >
                {campaignLoading ? 'Generating...' : `Generate Campaign (${selectedIds.size})`}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="table-wrap">
        {sorted.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <div className="empty-state-title">No customers match the current filters</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === sorted.length && sorted.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Customer ID</th>
                <th onClick={() => handleSort('risk_score')} style={{ cursor: 'pointer' }}>
                  Risk Score <SortIcon col="risk_score" />
                </th>
                <th onClick={() => handleSort('monthly_charges')} style={{ cursor: 'pointer' }}>
                  Monthly Rev <SortIcon col="monthly_charges" />
                </th>
                <th onClick={() => handleSort('financial_risk')} style={{ cursor: 'pointer' }}>
                  Risk ($) <SortIcon col="financial_risk" />
                </th>
                <th onClick={() => handleSort('tenure')} style={{ cursor: 'pointer' }}>
                  Tenure <SortIcon col="tenure" />
                </th>
                <th>Contact Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(c => {
                const level = getRiskLevel(c.risk_score || 0)
                const statusColor = STATUS_DOTS[c.contact_status] || 'var(--text-muted)'
                const isSelected = selectedIds.has(c.id)
                return (
                  <tr
                    key={c.id}
                    onClick={() => onRowClick(c.id)}
                    style={{ background: isSelected ? 'rgba(0,212,255,0.05)' : undefined }}
                  >
                    <td onClick={(e) => toggleSelect(e, c.id)} style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleSelect(e, c.id)}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{c.customer_id}</span>
                    </td>
                    <td>
                      <RiskBar score={c.risk_score || 0} />
                    </td>
                    <td>
                      {c.monthly_charges != null
                        ? `$${c.monthly_charges.toFixed(2)}`
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>
                      }
                    </td>
                    <td>
                      {(() => {
                        const score = c.risk_score > 0 && c.risk_score <= 1 ? c.risk_score : (c.risk_score || 0) / 100
                        const riskMoney = score * (c.monthly_charges || 0)
                        return <strong style={{ color: 'var(--risk-high)' }}>${riskMoney.toFixed(2)}</strong>
                      })()}
                    </td>
                    <td>
                      {c.tenure != null
                        ? `${c.tenure}mo`
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>
                      }
                    </td>
                    <td>
                      <span className={`status-badge ${c.contact_status}`}>
                        <span className="dot" style={{ background: statusColor }} />
                        {c.contact_status.replace('_', ' ')}
                      </span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      {isManager ? (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>view only</span>
                      ) : updatingId === c.id ? (
                        <span className="spinner" style={{ width: 16, height: 16 }} />
                      ) : (
                        <select
                          id={`status-select-${c.id}`}
                          className="filter-select"
                          value={c.contact_status}
                          onChange={e => handleStatusChange(e, c.id)}
                          style={{ fontSize: 12, padding: '4px 8px' }}
                        >
                          {STATUS_OPTIONS.map(s => (
                            <option key={s} value={s}>{s.replace('_', ' ')}</option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '12px 0' }}>
            <button className="btn btn-ghost" disabled={page === 0} onClick={() => setPage(0)} style={{ fontSize: 12 }}>« First</button>
            <button className="btn btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ fontSize: 12 }}>‹ Prev</button>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Page {page + 1} of {totalPages}</span>
            <button className="btn btn-ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={{ fontSize: 12 }}>Next ›</button>
            <button className="btn btn-ghost" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)} style={{ fontSize: 12 }}>Last »</button>
          </div>
        )}
      </div>

      {campaignResult && (
        <div className="modal-backdrop" onClick={() => setCampaignResult(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <h2 style={{ marginTop: 0 }}>AI Campaign Draft</h2>
            <p style={{ color: 'var(--text-muted)' }}>Generated for {selectedIds.size} high-risk customers.</p>
            <div style={{ background: 'var(--bg-elevated)', padding: 16, borderRadius: 8, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 13, border: '1px solid var(--border)' }}>
              {campaignResult}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, gap: 12 }}>
              <button className="btn btn-ghost" onClick={() => setCampaignResult(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => {
                navigator.clipboard.writeText(campaignResult)
                alert("Copied to clipboard!")
              }}>Copy to Clipboard</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
