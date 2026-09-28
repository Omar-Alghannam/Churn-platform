import { useState, useEffect, useRef } from 'react'
import { sendChat, getChatHistory } from '../api.js'

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

const SUGGESTIONS = [
  'Who are my top 5 highest-value at-risk customers?',
  'Which segment has the most churn risk?',
  'Why is my highest-risk customer at risk?',
  'How many month-to-month customers are high risk?',
  'Suggest an action for my riskiest customer.',
]

export default function ChatPanel({ sessionId }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const endRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (!sessionId) return
    setMessages([])
    setHistoryLoaded(false)
    getChatHistory(sessionId)
      .then(hist => {
        setMessages(hist.filter(m => m.role === 'user' || m.role === 'assistant'))
        setHistoryLoaded(true)
      })
      .catch(() => setHistoryLoaded(true))
  }, [sessionId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async (text) => {
    const content = (text || input).trim()
    if (!content || loading || !sessionId) return

    setInput('')
    // Optimistic user message
    setMessages(prev => [...prev, {
      id: Date.now(),
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    }])
    setLoading(true)

    try {
      const res = await sendChat(sessionId, content)
      setMessages(res.history.filter(m => m.role === 'user' || m.role === 'assistant'))
    } catch (e) {
      const errMsg = e.response?.data?.detail || 'Chat error — check that Azure OpenAI is configured in .env'
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        content: `Error: ${errMsg}`,
        created_at: new Date().toISOString(),
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  if (!sessionId) {
    return (
      <aside className="chat-panel">
        <div className="chat-header">
          AI Assistant
          <span className="chip-ai">GPT-4o-mini</span>
        </div>
        <div className="chat-empty">
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Select a session to chat
          </div>
          <div>The assistant can query your session's data and explain risk scores.</div>
        </div>
      </aside>
    )
  }

  return (
    <aside className="chat-panel">
      <div className="chat-header">
        AI Assistant
        <span className="chip-ai">GPT-4o-mini</span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && historyLoaded && !loading && (
          <div className="chat-empty">
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: 13 }}>
              Ask anything about this session's data
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', marginTop: 4 }}>
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  id={`suggestion-${i}`}
                  onClick={() => send(s)}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-secondary)',
                    padding: '8px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'var(--transition)',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => e.target.style.borderColor = 'var(--accent)'}
                  onMouseLeave={e => e.target.style.borderColor = 'var(--border)'}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(m => (
          <div key={m.id} className={`chat-message ${m.role}`}>
            <div className="chat-bubble">{m.content}</div>
            <div className="chat-time">{formatTime(m.created_at)}</div>
          </div>
        ))}

        {loading && (
          <div className="chat-message assistant">
            <div className="chat-bubble" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="spinner" />
              <span style={{ color: 'var(--text-muted)' }}>Thinking…</span>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="chat-input-wrap">
        <textarea
          id="chat-input"
          ref={textareaRef}
          className="chat-input"
          placeholder="Ask about your customers…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          disabled={loading}
        />
        <button
          id="chat-send-btn"
          className="chat-send-btn"
          onClick={() => send()}
          disabled={!input.trim() || loading}
        >
          Send
        </button>
      </div>
    </aside>
  )
}
