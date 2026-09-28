import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar.jsx'
import StatCards from './components/StatCards.jsx'
import DashboardCharts from './components/DashboardCharts.jsx'
import CustomerTable from './components/CustomerTable.jsx'
import CustomerDetail from './components/CustomerDetail.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import UploadPanel from './components/UploadPanel.jsx'
import TeamManagement from './components/TeamManagement.jsx'
import LoginPage from './components/LoginPage.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import AddCustomerModal from './components/AddCustomerModal.jsx'
import { getSessions, getSessionStats, getCustomers, logoutUser } from './api.js'

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const u = JSON.parse(localStorage.getItem('churn_user')) || null
      const validMockEmails = [
        'sarah.director@telecom.com',
        'marcus.lead@telecom.com',
        'alex.agent@telecom.com',
        'elena.agent@telecom.com',
        'david.agent@telecom.com',
        'priya.agent@telecom.com',
        'omar.agent@telecom.com',
      ]
      if (u && !validMockEmails.includes(u.email?.toLowerCase())) {
        localStorage.removeItem('churn_user')
        localStorage.removeItem('churn_token')
        return null
      }
      return u
    } catch {
      return null
    }
  })
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [customers, setCustomers] = useState([])
  const [customersLoading, setCustomersLoading] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState(null)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [showChat, setShowChat] = useState(true)
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false)

  const isManager = currentUser?.role === 'manager'
  const TABS = isManager
    ? { dashboard: 'Dashboard', upload: 'Upload Data', teams: 'Teams' }
    : { dashboard: 'My Call Queue', teams: 'My Team' }

  // ── Load sessions on mount ────────────────────────────────────────────────
  const refreshSessions = useCallback(async () => {
    try {
      const s = await getSessions()
      setSessions(s)
      return s
    } catch (e) {
      console.error(e)
      return []
    }
  }, [])

  useEffect(() => {
    if (!currentUser) {
      setSessions([])
      setActiveSessionId(null)
      return
    }
    refreshSessions().then(s => {
      if (s.length > 0) {
        setActiveSessionId(prev => (s.some(item => item.id === prev) ? prev : s[0].id))
      } else {
        setActiveSessionId(null)
      }
    })
  }, [currentUser, refreshSessions])


  // ── Load stats + customers when session changes ───────────────────────────
  useEffect(() => {
    if (!activeSessionId) return
    setStats(null)
    setCustomers([])

    setStatsLoading(true)
    getSessionStats(activeSessionId)
      .then(setStats)
      .finally(() => setStatsLoading(false))

    setCustomersLoading(true)
    getCustomers(activeSessionId, { limit: 100000 })
      .then(setCustomers)
      .finally(() => setCustomersLoading(false))
  }, [activeSessionId])

  const handleSessionCreated = async (s) => {
    await refreshSessions()
    setActiveSessionId(s.id)
    setActiveTab('upload')
  }

  const handleSessionSelect = (id) => {
    setActiveSessionId(id)
    setSelectedCustomerId(null)
    setActiveTab('dashboard')
  }

  const handleUploadComplete = async (sessionId) => {
    await refreshSessions()
    setActiveSessionId(sessionId)
    setActiveTab('dashboard')

    setStatsLoading(true)
    getSessionStats(sessionId).then(setStats).finally(() => setStatsLoading(false))
    setCustomersLoading(true)
    getCustomers(sessionId, { limit: 100000 }).then(setCustomers).finally(() => setCustomersLoading(false))
  }

  const handleStatusUpdated = (customerId, newStatus) => {
    if (customerId && newStatus) {
      setCustomers(prev =>
        prev.map(c => c.id === customerId ? { ...c, contact_status: newStatus } : c)
      )
      setStats(prev => {
        if (!prev) return prev
        const oldCust = customers.find(c => c.id === customerId)
        const oldStatus = oldCust?.contact_status || 'not_contacted'
        let contactedDelta = 0
        let convertedDelta = 0

        const wasContacted = ['contacted', 'converted', 'lost'].includes(oldStatus)
        const isContacted = ['contacted', 'converted', 'lost'].includes(newStatus)
        if (!wasContacted && isContacted) contactedDelta = 1
        else if (wasContacted && !isContacted) contactedDelta = -1

        if (oldStatus !== 'converted' && newStatus === 'converted') convertedDelta = 1
        else if (oldStatus === 'converted' && newStatus !== 'converted') convertedDelta = -1

        return {
          ...prev,
          contacted_count: Math.max(0, (prev.contacted_count || 0) + contactedDelta),
          converted_count: Math.max(0, (prev.converted_count || 0) + convertedDelta),
        }
      })
    }
    if (activeSessionId) {
      getSessionStats(activeSessionId).then(setStats)
    }
  }


  const handleCustomerCreated = (newCust) => {
    setCustomers(prev => [newCust, ...prev])
    setSelectedCustomerId(newCust.id)
    if (activeSessionId) {
      getSessionStats(activeSessionId).then(setStats)
    }
  }

  const handleSessionDeleted = async (deletedId) => {
    const updated = await refreshSessions()
    if (activeSessionId === deletedId) {
      if (updated.length > 0) {
        setActiveSessionId(updated[0].id)
      } else {
        setActiveSessionId(null)
        setActiveTab('upload')
      }
    }
  }

  const handleSessionRenamed = async () => {
    await refreshSessions()
  }

  const handleSignOut = () => {
    logoutUser()
    setCurrentUser(null)
    setActiveSessionId(null)
  }

  if (!currentUser) {
    return <LoginPage onLoginSuccess={(user) => setCurrentUser(user)} />
  }

  const activeSession = sessions.find(s => s.id === activeSessionId)

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={handleSessionSelect}
        onSessionCreated={handleSessionCreated}
        onSessionDeleted={handleSessionDeleted}
        onSessionRenamed={handleSessionRenamed}
        isManager={isManager}
      />

      {/* Main area */}
      <div className="main-content">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-logo">Churn Intelligence</div>
          {activeSession && (
            <div className="topbar-session">/ {activeSession.name}</div>
          )}
          <div className="topbar-spacer" />

          {/* User Profile Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 12 }}>
            <NotificationBell />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--bg-elevated)',
                padding: '5px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{currentUser.name}</div>
                <div style={{ fontSize: 10, color: currentUser.role === 'manager' ? 'var(--accent)' : '#20d489', textTransform: 'capitalize' }}>
                  {currentUser.role === 'manager' ? 'Admin / Manager' : 'Retention Agent'}
                </div>
              </div>
            </div>

            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '5px 10px', color: 'var(--text-muted)' }}
              onClick={handleSignOut}
              title="Sign Out"
            >
              Sign Out
            </button>
          </div>

          {/* Tab buttons & Chat Toggle */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {Object.entries(TABS).map(([key, label]) => (
              <button
                key={key}
                id={`tab-${key}`}
                className={`btn ${activeTab === key ? 'btn-secondary' : 'btn-ghost'}`}
                style={{ fontSize: 13 }}
                onClick={() => setActiveTab(key)}
              >
                {label}
              </button>
            ))}
            <button
              className={`btn ${showChat ? 'btn-secondary' : 'btn-ghost'}`}
              style={{ fontSize: 13, marginLeft: 8 }}
              onClick={() => setShowChat(prev => !prev)}
              title="Toggle AI Chat Panel"
            >
              {showChat ? 'Hide Assistant' : 'AI Assistant'}
            </button>
          </div>
        </header>

        {/* Content + Chat */}
        <div className="content-area">
          <div className="dashboard-panel">
            {/* ── Teams tab ─────────────────────────────────────────────────── */}
            {activeTab === 'teams' && (
              <TeamManagement
                currentUser={currentUser}
                sessions={sessions}
                onTeamUpdated={refreshSessions}
              />
            )}

            {/* ── Upload tab ────────────────────────────────────────────────── */}
            {activeTab === 'upload' && isManager && (
              <>
                <div className="section-header" style={{ marginBottom: 20 }}>
                  <h1 className="section-title">Upload Customer Data</h1>
                </div>
                <div className="card">
                  <UploadPanel
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    onUploadComplete={handleUploadComplete}
                  />
                </div>
              </>
            )}

            {/* ── Dashboard tab ─────────────────────────────────────────────── */}
            {activeTab === 'dashboard' && (
              <>
                {!activeSessionId ? (
                  <div className="empty-state" style={{ paddingTop: 120 }}>
                    <div className="empty-state-title">No session selected</div>
                    <p>{isManager ? 'Create a new session and upload a CSV to get started.' : 'Your manager will assign customer sessions to your team.'}</p>
                    {isManager && (
                      <button
                        id="get-started-btn"
                        className="btn btn-primary"
                        style={{ marginTop: 12 }}
                        onClick={() => setActiveTab('upload')}
                      >
                        Get Started
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Stat cards */}
                    <StatCards stats={stats} loading={statsLoading} isManager={isManager} />

                    {/* Interactive Visual Charts — manager only */}
                    {isManager && <DashboardCharts customers={customers} stats={stats} />}

                    {/* Customer table */}
                    <div className="section-header">
                      <h2 className="section-title">{isManager ? 'Customer Portfolio' : 'Assigned Call Queue'}</h2>
                      <div className="section-spacer" />
                      {isManager && (
                        <button
                          id="upload-tab-btn"
                          className="btn btn-primary"
                          style={{ fontSize: 13 }}
                          onClick={() => setActiveTab('upload')}
                        >
                          Upload Batch
                        </button>
                      )}
                    </div>

                    {customers.length === 0 && !customersLoading ? (
                      <div className="empty-state" style={{ padding: 60 }}>
                        <div className="empty-state-title">No customers in this session</div>
                        <p>Upload a CSV to score customers.</p>
                      </div>
                    ) : (
                      <CustomerTable
                        customers={customers}
                        stats={stats}
                        loading={customersLoading}
                        onRowClick={setSelectedCustomerId}
                        onStatusUpdated={handleStatusUpdated}
                        onOpenAddCustomer={() => setIsAddCustomerOpen(true)}
                        isManager={isManager}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* Chat panel — toggleable */}
          {showChat && <ChatPanel sessionId={activeSessionId} />}
        </div>
      </div>

      {/* Customer detail drawer */}
      {selectedCustomerId && (
        <CustomerDetail
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
          onStatusUpdated={handleStatusUpdated}
          isManager={isManager}
        />
      )}

      {/* Add Single Customer Modal */}
      <AddCustomerModal
        sessionId={activeSessionId}
        isOpen={isAddCustomerOpen}
        onClose={() => setIsAddCustomerOpen(false)}
        onCustomerCreated={handleCustomerCreated}
      />
    </div>
  )
}
