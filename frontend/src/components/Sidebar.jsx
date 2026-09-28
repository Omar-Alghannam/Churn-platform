import { useState } from 'react'
import { createSession, deleteSession, renameSession } from '../api.js'

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelect,
  onSessionCreated,
  onSessionDeleted,
  onSessionRenamed,
  isManager,
}) {
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const s = await createSession({ name: name.trim(), description: desc.trim() || null })
      onSessionCreated(s)
      setShowNew(false)
      setName(''); setDesc('')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (e, session) => {
    e.stopPropagation()
    const ok = window.confirm(`Are you sure you want to delete session "${session.name}"? This will delete all its customers.`)
    if (!ok) return
    try {
      await deleteSession(session.id)
      if (onSessionDeleted) onSessionDeleted(session.id)
    } catch (err) {
      console.error(err)
      alert('Failed to delete session.')
    }
  }

  const handleRename = async (e, session) => {
    e.stopPropagation()
    const newName = window.prompt('Enter new session name:', session.name)
    if (!newName || !newName.trim() || newName.trim() === session.name) return
    try {
      await renameSession(session.id, newName.trim())
      if (onSessionRenamed) onSessionRenamed(session.id, newName.trim())
    } catch (err) {
      console.error(err)
      alert('Failed to rename session.')
    }
  }

  const fmtDate = (d) => {
    if (!d) return ''
    const dt = new Date(d)
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">Sessions</div>
        {isManager && (
          <button className="btn-new-session" onClick={() => setShowNew(true)}>
            <span>＋</span> New Session
          </button>
        )}
      </div>

      <div className="session-list">
        {sessions.length === 0 && (
          <div style={{ padding: '20px 12px', color: 'var(--text-muted)', fontSize: 12 }}>
            No sessions yet. Upload a CSV to start.
          </div>
        )}
        {sessions.map(s => (
          <div
            key={s.id}
            className={`session-item ${s.id === activeSessionId ? 'active' : ''}`}
            onClick={() => onSelect(s.id)}
          >
            <div className="session-item-content">
              <div className="session-item-name">{s.name}</div>
              <div className="session-item-meta">
                {s.customer_count} customers · {fmtDate(s.created_at)}
              </div>
            </div>
            {isManager && (
              <div className="session-item-actions">
                <button
                  className="session-action-btn"
                  title="Rename session"
                  onClick={(e) => handleRename(e, s)}
                  style={{ fontSize: 11 }}
                >
                  Edit
                </button>
                <button
                  className="session-action-btn delete"
                  title="Delete session"
                  onClick={(e) => handleDelete(e, s)}
                  style={{ fontSize: 11 }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Churn Intelligence v1.0
        </div>
      </div>


      {/* New session modal */}
      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Session</div>
            <div className="modal-sub">Create a workspace for a new dataset or customer segment.</div>

            <div className="form-field">
              <label className="form-label">Session Name *</label>
              <input
                id="session-name-input"
                className="form-input"
                placeholder="e.g. Q3 Enterprise Segment"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
            </div>

            <div className="form-field">
              <label className="form-label">Description (optional)</label>
              <input
                id="session-desc-input"
                className="form-input"
                placeholder="e.g. Monthly upload, fiber customers only"
                value={desc}
                onChange={e => setDesc(e.target.value)}
              />
            </div>

            <div className="modal-actions">
              <button id="cancel-session-btn" className="btn btn-secondary" onClick={() => setShowNew(false)}>
                Cancel
              </button>
              <button
                id="create-session-btn"
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={!name.trim() || loading}
              >
                {loading ? <span className="spinner" /> : 'Create Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
