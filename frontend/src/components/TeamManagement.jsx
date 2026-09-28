import { useState, useEffect } from 'react'
import {
  getTeams,
  createTeam,
  getWorkspaceRoster,
  addTeamMemberDirect,
  getTeamMetrics,
  assignSessionToTeam,
  removeTeamMember,
} from '../api.js'

export default function TeamManagement({ currentUser, sessions, onTeamUpdated }) {
  const [teams, setTeams] = useState([])
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [teamMetrics, setTeamMetrics] = useState(null)
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(false)
  const [metricsLoading, setMetricsLoading] = useState(false)

  // Form states
  const [newTeamName, setNewTeamName] = useState('')
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [assignSessionId, setAssignSessionId] = useState('')
  const [assignUserId, setAssignUserId] = useState('')
  const [assignQuota, setAssignQuota] = useState(50)
  const [assignNote, setAssignNote] = useState('')
  const [dispatchSuccess, setDispatchSuccess] = useState('')
  const [actionError, setActionError] = useState('')

  const isManager = currentUser?.role === 'manager'

  // Load teams and workspace roster
  const loadWorkspaceData = async () => {
    setLoading(true)
    try {
      const [tList, rList] = await Promise.all([
        getTeams(),
        getWorkspaceRoster(),
      ])
      setTeams(tList)
      setRoster(rList)
      if (tList.length > 0 && !selectedTeamId) {
        setSelectedTeamId(String(tList[0].id))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Load metrics whenever selected team changes
  const loadMetrics = async (teamId) => {
    if (!teamId) return
    setMetricsLoading(true)
    try {
      const m = await getTeamMetrics(Number(teamId))
      setTeamMetrics(m)
    } catch (err) {
      console.error('Failed to load team metrics', err)
    } finally {
      setMetricsLoading(false)
    }
  }

  useEffect(() => {
    loadWorkspaceData()
  }, [currentUser])

  useEffect(() => {
    if (selectedTeamId) {
      loadMetrics(selectedTeamId)
    }
  }, [selectedTeamId])

  const handleCreateTeam = async (e) => {
    e.preventDefault()
    if (!newTeamName.trim()) return
    try {
      setActionError('')
      const created = await createTeam(newTeamName.trim())
      setNewTeamName('')
      setShowCreateTeam(false)
      await loadWorkspaceData()
      setSelectedTeamId(String(created.id))
      if (onTeamUpdated) onTeamUpdated()
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to create team.')
    }
  }

  const handleAddMemberFromRoster = async (userId) => {
    if (!selectedTeamId) return
    try {
      setActionError('')
      await addTeamMemberDirect(Number(selectedTeamId), Number(userId), 'member', 50)
      await Promise.all([loadWorkspaceData(), loadMetrics(selectedTeamId)])
      if (onTeamUpdated) onTeamUpdated()
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to add member to team.')
    }
  }

  const handleRemoveMember = async (teamId, userId) => {
    if (!confirm('Remove this member from the squad?')) return
    try {
      setActionError('')
      await removeTeamMember(Number(teamId), Number(userId))
      await Promise.all([loadWorkspaceData(), loadMetrics(teamId)])
      if (onTeamUpdated) onTeamUpdated()
    } catch (err) {
      setActionError('Failed to remove member.')
    }
  }

  const handleAssignSession = async (e) => {
    e.preventDefault()
    if (!selectedTeamId || !assignSessionId || !assignUserId) return
    try {
      setActionError('')
      setDispatchSuccess('')
      await assignSessionToTeam(Number(selectedTeamId), Number(assignSessionId), {
        user_id: Number(assignUserId),
        target_quota: Number(assignQuota),
        note: assignNote.trim(),
      })
      setDispatchSuccess('Session and quota assigned successfully! Alert dispatched to agent queue.')
      setAssignSessionId('')
      setAssignUserId('')
      setAssignNote('')
      await loadMetrics(selectedTeamId)
      if (onTeamUpdated) onTeamUpdated()
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to dispatch session.')
    }
  }

  const currentTeam = teams.find(t => String(t.id) === String(selectedTeamId))
  const memberUserIds = new Set((currentTeam?.members || []).map(m => m.user_id))
  const availableRosterUsers = roster.filter(u => !memberUserIds.has(u.id))

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── Top Header & Team Selector ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-surface)',
          padding: '16px 20px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-dim)',
              border: '1px solid var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
            }}
          >

          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                Enterprise Retention Squads
              </h2>
              <span className="badge" style={{ fontSize: 11 }}>
                B2B Production
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Workforce management, live quota tracking, and agent performance leaderboards.
            </p>
          </div>
        </div>

        {/* Squad Selection Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            className="filter-select"
            value={selectedTeamId}
            onChange={e => setSelectedTeamId(e.target.value)}
            style={{ minWidth: 200, fontSize: 13, fontWeight: 600 }}
          >
            {teams.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.members?.length || 0} agents)
              </option>
            ))}
          </select>

          {isManager && (
            <button
              className="btn btn-secondary"
              onClick={() => setShowCreateTeam(!showCreateTeam)}
              style={{ fontSize: 12, padding: '7px 12px', whiteSpace: 'nowrap' }}
            >
              {showCreateTeam ? 'Cancel' : '+ New Squad'}
            </button>
          )}
        </div>
      </div>

      {/* Inline Create Squad Form */}
      {showCreateTeam && (
        <form
          onSubmit={handleCreateTeam}
          className="card"
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--accent)',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>Create New Squad:</div>
          <input
            className="form-input"
            placeholder="e.g. High-Value Account Retention Squad"
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            style={{ flex: 1, fontSize: 13 }}
            autoFocus
          />
          <button type="submit" className="btn btn-primary" style={{ padding: '7px 16px', fontSize: 13 }}>
            Create Squad
          </button>
        </form>
      )}

      {actionError && <div className="alert error">{actionError}</div>}
      {dispatchSuccess && <div className="alert success">{dispatchSuccess}</div>}

      {/* ── Squad KPI Overview Bar ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
        }}
      >
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Active Squad Agents</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
            {teamMetrics?.total_agents ?? currentTeam?.members?.length ?? 0}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>In {currentTeam?.name || 'Squad'}</div>
        </div>

        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Total Contacts Made</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)', marginTop: 4 }}>
            {teamMetrics?.total_contacted ?? 0}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Across assigned sessions</div>
        </div>

        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Squad Retention Rate</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--risk-low)', marginTop: 4 }}>
            {teamMetrics?.team_retention_rate ?? 0}%
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {teamMetrics?.total_saved ?? 0} accounts converted
          </div>
        </div>

        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Revenue Rescued (MRR)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--risk-low)', marginTop: 4 }}>
            ${(teamMetrics?.revenue_saved ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Preserved recurring revenue</div>
        </div>
      </div>

      {/* ── Main Squad Content Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr', gap: 20 }}>
        {/* Left Column: Squad Leaderboard & Members */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Squad Leaderboard Card */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  Squad Performance Leaderboard
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Real-time quota progress and customer conversion tracking.
                </div>
              </div>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => loadMetrics(selectedTeamId)}
                disabled={metricsLoading}
              >
                {metricsLoading ? 'Refreshing...' : '↻ Refresh'}
              </button>
            </div>

            {/* Leaderboard Table */}
            {(() => {
              const workingAgents = (teamMetrics?.agent_metrics || []).filter(a => a.role !== 'leader')
              if (workingAgents.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                    No active agents in this squad yet. Add agents from the workspace roster on the right.
                  </div>
                )
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {workingAgents.map((agent, index) => {
                    const rankBadge = `#${index + 1}`
                    const progressColor = agent.progress_pct >= 80 ? 'var(--risk-low)' : agent.progress_pct >= 40 ? 'var(--accent)' : 'var(--risk-med)'

                    return (
                      <div
                        key={agent.user_id}
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 16,
                        }}
                      >
                        {/* Rank & Agent Info */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 170 }}>
                          <span style={{ fontSize: 16, fontWeight: 700, width: 24, textAlign: 'center' }}>
                            {rankBadge}
                          </span>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{agent.name}</span>
                              <span
                                className="badge"
                                style={{
                                  fontSize: 10,
                                  background: 'var(--bg-surface)',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                Agent
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{agent.email}</div>
                          </div>
                        </div>

                        {/* Quota Progress Bar */}
                        <div style={{ flex: 1, maxWidth: 220 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Target Quota</span>
                            <span style={{ fontWeight: 600, color: progressColor }}>
                              {agent.contacted_count} / {agent.target_quota} ({agent.progress_pct}%)
                            </span>
                          </div>
                          <div
                            style={{
                              height: 6,
                              background: 'var(--bg-surface)',
                              borderRadius: 3,
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(100, agent.progress_pct)}%`,
                                height: '100%',
                                background: progressColor,
                                transition: 'width 0.4s ease',
                              }}
                            />
                          </div>
                        </div>

                        {/* Revenue Saved & Conversion */}
                        <div style={{ textAlign: 'right', minWidth: 110 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--risk-low)' }}>
                            ${agent.revenue_saved.toFixed(2)}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {agent.saved_count} saved
                          </div>
                        </div>

                        {/* Manager Remove Action */}
                        {isManager && (
                          <button
                            onClick={() => handleRemoveMember(selectedTeamId, agent.user_id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              fontSize: 12,
                              padding: '4px 8px',
                            }}
                            title="Remove from squad"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* Workload & Quota Dispatcher (Manager Only) */}
          {isManager && (
            <div className="card" style={{ padding: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                  Workload & Quota Dispatcher
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Allocate a customer session and set a target quota for an agent.
                </div>
              </div>

              <form onSubmit={handleAssignSession} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {/* Select Session */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      1. Target Session
                    </label>
                    <select
                      className="filter-select"
                      style={{ width: '100%', fontSize: 13 }}
                      value={assignSessionId}
                      onChange={e => setAssignSessionId(e.target.value)}
                      required
                    >
                      <option value="" disabled>— Select Session —</option>
                      {sessions.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.customer_count} accounts) — {s.assigned_to_name ? `Assigned to: ${s.assigned_to_name}` : 'Unassigned'}
                        </option>
                      ))}
                    </select>
                  </div>


                  {/* Select Agent */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      2. Assignee Agent
                    </label>
                    <select
                      className="filter-select"
                      style={{ width: '100%', fontSize: 13 }}
                      value={assignUserId}
                      onChange={e => setAssignUserId(e.target.value)}
                      required
                    >
                      <option value="" disabled>— Select Retention Agent —</option>
                      {currentTeam?.members
                        ?.filter(m => m.role !== 'leader')
                        ?.map(m => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.name} (Agent)
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
                  {/* Target Quota */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      3. Target Quota
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      className="form-input"
                      value={assignQuota}
                      onChange={e => setAssignQuota(e.target.value)}
                      style={{ width: '100%', fontSize: 13 }}
                      required
                    />
                  </div>

                  {/* Notes / Instructions */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      4. Campaign Instructions (Optional)
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Call Month-to-month fiber accounts first."
                      value={assignNote}
                      onChange={e => setAssignNote(e.target.value)}
                      style={{ width: '100%', fontSize: 13 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={!assignSessionId || !assignUserId}
                    style={{ padding: '8px 20px', fontWeight: 600 }}
                  >
                    Dispatch Workload & Alert Agent
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Right Column: Company Workspace Roster (1-Click Assignment) */}
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                Workspace Roster
              </h3>
              <span className="badge" style={{ fontSize: 11 }}>
                {roster.length} Users
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Add available company agents to <strong>{currentTeam?.name || 'this squad'}</strong> in 1 click.
            </div>
          </div>

          {/* Available Users List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 520, overflowY: 'auto' }}>
            {availableRosterUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                All workspace users are already assigned to this squad!
              </div>
            ) : (
              availableRosterUsers.map(user => (
                <div
                  key={user.id}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {user.name}
                      <span className="badge" style={{ fontSize: 10 }}>
                        {user.role === 'manager' ? 'Manager' : 'Agent'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user.email}</div>
                    {user.team_name && (
                      <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 2 }}>
                        Current: {user.team_name}
                      </div>
                    )}
                  </div>

                  {isManager && (
                    <button
                      className="btn btn-primary"
                      onClick={() => handleAddMemberFromRoster(user.id)}
                      style={{ padding: '4px 10px', fontSize: 11, whiteSpace: 'nowrap' }}
                    >
                      + Add
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
