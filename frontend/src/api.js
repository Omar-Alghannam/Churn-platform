import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 60000,
})

// Attach auth token from localStorage if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('churn_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Auth ──────────────────────────────────────────────────────────────────────
export const loginUser = (email, password) =>
  api.post('/auth/login', { email, password }).then(r => {
    if (r.data.access_token) {
      localStorage.setItem('churn_token', r.data.access_token)
      localStorage.setItem('churn_user', JSON.stringify(r.data.user))
    }
    return r.data
  })

export const registerUser = (data) =>
  api.post('/auth/register', data).then(r => {
    if (r.data.access_token) {
      localStorage.setItem('churn_token', r.data.access_token)
      localStorage.setItem('churn_user', JSON.stringify(r.data.user))
    }
    return r.data
  })

export const getMe = () => api.get('/auth/me').then(r => r.data)

export const logoutUser = () => {
  localStorage.removeItem('churn_token')
  localStorage.removeItem('churn_user')
}

// ── Teams & Invites ──────────────────────────────────────────────────────────
export const getTeams = () => api.get('/teams/').then(r => r.data)
export const createTeam = (name) => api.post('/teams/', { name }).then(r => r.data)
export const getWorkspaceRoster = () => api.get('/teams/roster').then(r => r.data)
export const addTeamMemberDirect = (teamId, userId, role = 'member', targetQuota = 50) =>
  api.post(`/teams/${teamId}/members`, { user_id: userId, role, target_quota: targetQuota }).then(r => r.data)
export const getTeamMetrics = (teamId) =>
  api.get(`/teams/${teamId}/metrics`).then(r => r.data)

export const inviteTeamMember = (teamId, email, role = 'sales_agent') =>
  api.post(`/teams/${teamId}/invites`, { email, role }).then(r => r.data)

export const getPendingInvites = (email) =>
  api.get('/teams/invites/pending', { params: { email } }).then(r => r.data)

export const acceptInvite = (inviteId) =>
  api.post(`/teams/invites/${inviteId}/accept`).then(r => r.data)

export const declineInvite = (inviteId) =>
  api.post(`/teams/invites/${inviteId}/decline`).then(r => r.data)

export const assignSessionToTeam = (teamId, sessionId, payload) =>
  api.post(`/teams/${teamId}/assign-session/${sessionId}`, payload).then(r => r.data)

export const removeTeamMember = (teamId, userId) =>
  api.delete(`/teams/${teamId}/members/${userId}`).then(r => r.data)

export const sendTestEmail = (email) =>
  api.post('/teams/test-email', null, { params: { email } }).then(r => r.data)

// ── Notifications ─────────────────────────────────────────────────────────────
export const getUnreadNotifications = () =>
  api.get(`/notifications/unread`).then(r => r.data)

export const markNotificationRead = (notificationId) =>
  api.put(`/notifications/${notificationId}/read`).then(r => r.data)

export const markAllNotificationsRead = () =>
  api.put(`/notifications/read-all`).then(r => r.data)

// ── Sessions ──────────────────────────────────────────────────────────────────
export const getSessions = () => api.get('/sessions/').then(r => r.data)
export const createSession = (data) => api.post('/sessions/', data).then(r => r.data)
export const deleteSession = (id) => api.delete(`/sessions/${id}`)
export const renameSession = (id, name) => api.patch(`/sessions/${id}`, { name }).then(r => r.data)
export const getSessionStats = (id) => api.get(`/sessions/${id}/stats`).then(r => r.data)
export const getChatHistory = (id) => api.get(`/sessions/${id}/chat-history`).then(r => r.data)

// ── Customers ─────────────────────────────────────────────────────────────────
export const getCustomers = (sessionId, params = {}) =>
  api.get(`/customers/session/${sessionId}`, { params }).then(r => r.data)

export const getCustomerDetail = (id) =>
  api.get(`/customers/${id}`).then(r => r.data)

export const updateContactStatus = (id, status, notes) =>
  api.patch(`/customers/${id}/status`, { status, notes }).then(r => r.data)

export const updateBulkContactStatus = (customerIds, status) =>
  api.patch(`/customers/bulk_status`, { customer_ids: customerIds, status }).then(r => r.data)

export const createCustomer = (data) =>
  api.post('/customers/', data).then(r => r.data)

export const previewCustomerRisk = (data) =>
  api.post('/customers/preview-risk', data).then(r => r.data)

// ── Upload ────────────────────────────────────────────────────────────────────
export const uploadCSV = (file, sessionId, sessionName) => {
  const form = new FormData()
  form.append('file', file)
  if (sessionId) form.append('session_id', String(sessionId))
  if (sessionName) form.append('session_name', sessionName)
  return api.post('/upload/', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180000,
  }).then(r => r.data)
}

// ── Chat ──────────────────────────────────────────────────────────────────────
export const sendChat = (sessionId, content) =>
  api.post(`/chat/${sessionId}`, { content }).then(r => r.data)

export const generateBulkCampaign = (customerIds) =>
  api.post('/chat/bulk_campaign', { customer_ids: customerIds }).then(r => r.data)
