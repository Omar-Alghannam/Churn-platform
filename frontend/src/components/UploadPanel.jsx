import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { uploadCSV } from '../api.js'

export default function UploadPanel({ sessions, activeSessionId, onUploadComplete }) {
  const [mode, setMode] = useState('new') // 'new' | 'append'
  const [sessionName, setSessionName] = useState('')
  const [targetSessionId, setTargetSessionId] = useState(activeSessionId || '')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'text/csv': ['.csv'], 'application/vnd.ms-excel': ['.csv'] },
    multiple: false,
    onDrop: (accepted) => {
      setFile(accepted[0] || null)
      setResult(null)
      setError(null)
    },
  })

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const sid = mode === 'append' ? Number(targetSessionId) : null
      const sname = mode === 'new' ? (sessionName.trim() || file.name.replace('.csv', '')) : null
      const res = await uploadCSV(file, sid, sname)
      setResult(res)
      onUploadComplete(res.session_id)
      setFile(null)
    } catch (e) {
      setError(e.response?.data?.detail || 'Upload failed. Check the backend logs.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      {/* Upload mode */}
      <div className="upload-options">
        <label className={`upload-option ${mode === 'new' ? 'selected' : ''}`}>
          <input
            type="radio"
            className="upload-option-radio"
            name="upload-mode"
            value="new"
            checked={mode === 'new'}
            onChange={() => setMode('new')}
          />
          <div className="upload-option-text">
            <div className="upload-option-title">New Session</div>
            <div className="upload-option-desc">Create a fresh workspace for this dataset</div>
          </div>
        </label>

        <label className={`upload-option ${mode === 'append' ? 'selected' : ''}`}>
          <input
            type="radio"
            className="upload-option-radio"
            name="upload-mode"
            value="append"
            checked={mode === 'append'}
            onChange={() => setMode('append')}
          />
          <div className="upload-option-text">
            <div className="upload-option-title">Append to Existing Session</div>
            <div className="upload-option-desc">Add more customer records to an active session</div>
          </div>
        </label>
      </div>

      {/* Session name / selector */}
      {mode === 'new' && (
        <div className="form-field">
          <label className="form-label">Session Name</label>
          <input
            id="upload-session-name"
            className="form-input"
            placeholder="e.g. August Enterprise Batch"
            value={sessionName}
            onChange={e => setSessionName(e.target.value)}
          />
        </div>
      )}
      {mode === 'append' && (
        <div className="form-field">
          <label className="form-label">Target Session</label>
          <select
            id="upload-target-session"
            className="filter-select"
            style={{ width: '100%' }}
            value={targetSessionId}
            onChange={e => setTargetSessionId(e.target.value)}
          >
            <option value="">— Select session —</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.customer_count} customers)</option>
            ))}
          </select>
        </div>
      )}

      {/* Drop zone */}
      <div {...getRootProps()} className={`upload-zone ${isDragActive ? 'active' : ''}`}>
        <input {...getInputProps()} id="csv-file-input" />
        {file ? (
          <>
            <div className="upload-zone-text">{file.name}</div>
            <div className="upload-zone-sub">{(file.size / 1024).toFixed(1)} KB · Click to change file</div>
          </>
        ) : (
          <>
            <div className="upload-zone-text">Drop CSV file here or click to browse</div>
            <div className="upload-zone-sub">Standard customer churn schema required</div>
          </>
        )}
      </div>

      {error && <div className="alert error" style={{ marginTop: 12 }}>{error}</div>}

      {result && (
        <div className="alert success" style={{ marginTop: 12 }}>
          Successfully processed {result.rows_processed} customer records
          {result.rows_failed > 0 && ` (${result.rows_failed} rows failed)`}
        </div>
      )}

      {loading && (
        <div style={{ marginTop: 12 }}>
          <div className="progress-bar-wrap">
            <div className="progress-bar-fill" style={{ width: '60%' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            Executing predictive scoring model...
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button
          id="upload-btn"
          className="btn btn-primary"
          onClick={handleUpload}
          disabled={!file || loading || (mode === 'append' && !targetSessionId)}
        >
          {loading ? <><span className="spinner" /> Processing...</> : 'Process & Upload'}
        </button>
      </div>
    </div>
  )
}
