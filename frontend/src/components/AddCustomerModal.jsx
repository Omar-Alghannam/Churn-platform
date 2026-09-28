import { useState, useEffect, useRef } from 'react'
import { previewCustomerRisk, createCustomer } from '../api.js'

export default function AddCustomerModal({ sessionId, isOpen, onClose, onCustomerCreated }) {
  const [formData, setFormData] = useState({
    customer_id: '',
    gender: 'Male',
    SeniorCitizen: 0,
    Partner: 'No',
    Dependents: 'No',
    tenure: 4,
    PhoneService: 'Yes',
    MultipleLines: 'No',
    InternetService: 'Fiber optic',
    OnlineSecurity: 'No',
    OnlineBackup: 'No',
    DeviceProtection: 'No',
    TechSupport: 'No',
    StreamingTV: 'Yes',
    StreamingMovies: 'Yes',
    Contract: 'Month-to-month',
    PaperlessBilling: 'Yes',
    PaymentMethod: 'Electronic check',
    MonthlyCharges: 85.0,
    TotalCharges: 340.0,
  })

  const [activeCategory, setActiveCategory] = useState('contract') // 'contract' | 'services' | 'demographics'
  const [predictedRisk, setPredictedRisk] = useState(null)
  const [predicting, setPredicting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const debounceTimer = useRef(null)

  // Live Risk Calculation debounce
  useEffect(() => {
    if (!isOpen) return

    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(async () => {
      setPredicting(true)
      try {
        const res = await previewCustomerRisk({
          ...formData,
          MonthlyCharges: Number(formData.MonthlyCharges),
          tenure: Number(formData.tenure),
          TotalCharges: Number(formData.MonthlyCharges) * Math.max(1, Number(formData.tenure)),
        })
        setPredictedRisk(res)
      } catch (err) {
        console.error('Failed to preview risk', err)
      } finally {
        setPredicting(false)
      }
    }, 250)

    return () => clearTimeout(debounceTimer.current)
  }, [formData, isOpen])

  if (!isOpen) return null

  const handleFieldChange = (field, value) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value }
      if (field === 'tenure' || field === 'MonthlyCharges') {
        const m = field === 'MonthlyCharges' ? Number(value) : Number(prev.MonthlyCharges)
        const t = field === 'tenure' ? Number(value) : Number(prev.tenure)
        updated.TotalCharges = Math.round(m * Math.max(1, t) * 100) / 100
      }
      return updated
    })
  }

  // Quick feature profile presets
  const applyPreset = (type) => {
    if (type === 'high_risk') {
      setFormData({
        customer_id: '',
        gender: 'Male',
        SeniorCitizen: 1,
        Partner: 'No',
        Dependents: 'No',
        tenure: 2,
        PhoneService: 'Yes',
        MultipleLines: 'No',
        InternetService: 'Fiber optic',
        OnlineSecurity: 'No',
        OnlineBackup: 'No',
        DeviceProtection: 'No',
        TechSupport: 'No',
        StreamingTV: 'Yes',
        StreamingMovies: 'Yes',
        Contract: 'Month-to-month',
        PaperlessBilling: 'Yes',
        PaymentMethod: 'Electronic check',
        MonthlyCharges: 98.5,
        TotalCharges: 197.0,
      })
    } else if (type === 'low_risk') {
      setFormData({
        customer_id: '',
        gender: 'Female',
        SeniorCitizen: 0,
        Partner: 'Yes',
        Dependents: 'Yes',
        tenure: 48,
        PhoneService: 'Yes',
        MultipleLines: 'Yes',
        InternetService: 'DSL',
        OnlineSecurity: 'Yes',
        OnlineBackup: 'Yes',
        DeviceProtection: 'Yes',
        TechSupport: 'Yes',
        StreamingTV: 'No',
        StreamingMovies: 'No',
        Contract: 'Two year',
        PaperlessBilling: 'No',
        PaymentMethod: 'Bank transfer (automatic)',
        MonthlyCharges: 64.0,
        TotalCharges: 3072.0,
      })
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!sessionId) {
      setError('Please select or create an active session first.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const payload = {
        session_id: Number(sessionId),
        customer_id: formData.customer_id.trim() || undefined,
        gender: formData.gender,
        SeniorCitizen: Number(formData.SeniorCitizen),
        Partner: formData.Partner,
        Dependents: formData.Dependents,
        tenure: Number(formData.tenure),
        PhoneService: formData.PhoneService,
        MultipleLines: formData.MultipleLines,
        InternetService: formData.InternetService,
        OnlineSecurity: formData.OnlineSecurity,
        OnlineBackup: formData.OnlineBackup,
        DeviceProtection: formData.DeviceProtection,
        TechSupport: formData.TechSupport,
        StreamingTV: formData.StreamingTV,
        StreamingMovies: formData.StreamingMovies,
        Contract: formData.Contract,
        PaperlessBilling: formData.PaperlessBilling,
        PaymentMethod: formData.PaymentMethod,
        MonthlyCharges: Number(formData.MonthlyCharges),
        TotalCharges: Number(formData.TotalCharges),
      }

      const created = await createCustomer(payload)
      if (onCustomerCreated) onCustomerCreated(created)
      onClose()
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.detail || 'Failed to create customer.')
    } finally {
      setSubmitting(false)
    }
  }

  const score = predictedRisk?.risk_score ?? 50
  const riskLevel = predictedRisk?.risk_level ?? (score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low')

  const riskColor = riskLevel === 'high' ? 'var(--risk-high)' : riskLevel === 'medium' ? 'var(--risk-med)' : 'var(--risk-low)'
  const riskBg = riskLevel === 'high' ? 'var(--risk-high-bg)' : riskLevel === 'medium' ? 'var(--risk-med-bg)' : 'var(--risk-low-bg)'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 8, 18, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(0, 212, 255, 0.1)',
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
                Add Single Customer
              </h2>
              <span className="badge" style={{ background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: 11 }}>
                Live ML Inference
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Filter & toggle customer traits to generate real-time churn prediction and SHAP drivers.
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 20,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Live ML Prediction Meter Banner */}
        <div
          style={{
            padding: '16px 24px',
            background: riskBg,
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'var(--bg-surface)',
                border: `3px solid ${riskColor}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 14,
                color: riskColor,
              }}
            >
              {score.toFixed(0)}%
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: riskColor, textTransform: 'uppercase' }}>
                  {riskLevel} Churn Risk
                </span>
                {predicting && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Calculating...</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Estimated Churn Probability: <strong>{((score / 100) * 100).toFixed(1)}%</strong>
              </div>
            </div>
          </div>

          {/* Preset Buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 11, padding: '4px 10px', color: 'var(--risk-high)' }}
              onClick={() => applyPreset('high_risk')}
            >
              High-Risk Preset
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 11, padding: '4px 10px', color: 'var(--risk-low)' }}
              onClick={() => applyPreset('low_risk')}
            >
              Low-Risk Preset
            </button>
          </div>
        </div>

        {/* Category Navigation Pills */}
        <div style={{ display: 'flex', gap: 8, padding: '14px 24px 0', borderBottom: '1px solid var(--border)' }}>
          {[
            { id: 'contract', label: '1. Contract & Billing' },
            { id: 'services', label: '2. Services & Add-ons' },
            { id: 'demographics', label: '3. Profile & Demographics' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveCategory(tab.id)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: activeCategory === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeCategory === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: activeCategory === tab.id ? 600 : 400,
                fontSize: 13,
                padding: '8px 12px',
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Body / Feature Form */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {error && <div className="alert error" style={{ marginBottom: 16 }}>{error}</div>}

          {/* ── Tab 1: Contract & Billing ── */}
          {activeCategory === 'contract' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Contract Type */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Contract Term
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['Month-to-month', 'One year', 'Two year'].map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleFieldChange('Contract', opt)}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 13,
                        fontWeight: formData.Contract === opt ? 600 : 400,
                        border: '1px solid',
                        borderColor: formData.Contract === opt ? 'var(--accent)' : 'var(--border)',
                        background: formData.Contract === opt ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                        color: formData.Contract === opt ? 'var(--accent)' : 'var(--text-primary)',
                        cursor: 'pointer',
                        transition: 'var(--transition)',
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Payment Method
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { id: 'Electronic check', label: 'Electronic Check' },
                    { id: 'Mailed check', label: 'Mailed Check' },
                    { id: 'Bank transfer (automatic)', label: 'Bank Transfer (Auto)' },
                    { id: 'Credit card (automatic)', label: 'Credit Card (Auto)' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleFieldChange('PaymentMethod', opt.id)}
                      style={{
                        padding: '9px 12px',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 12,
                        textAlign: 'left',
                        fontWeight: formData.PaymentMethod === opt.id ? 600 : 400,
                        border: '1px solid',
                        borderColor: formData.PaymentMethod === opt.id ? 'var(--accent)' : 'var(--border)',
                        background: formData.PaymentMethod === opt.id ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                        color: formData.PaymentMethod === opt.id ? 'var(--accent)' : 'var(--text-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tenure Slider */}
              <div style={{ background: 'var(--bg-elevated)', padding: '14px 16px', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Customer Tenure
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                    {formData.tenure} {formData.tenure === 1 ? 'month' : 'months'}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="72"
                  value={formData.tenure}
                  onChange={e => handleFieldChange('tenure', Number(e.target.value))}
                  style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  <span>1 month (New)</span>
                  <span>36 months (3 yrs)</span>
                  <span>72 months (6 yrs)</span>
                </div>
              </div>

              {/* Monthly Charges Slider */}
              <div style={{ background: 'var(--bg-elevated)', padding: '14px 16px', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Monthly Charges ($ MRR)
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    ${Number(formData.MonthlyCharges).toFixed(2)} / mo
                  </span>
                </div>
                <input
                  type="range"
                  min="18"
                  max="125"
                  step="0.5"
                  value={formData.MonthlyCharges}
                  onChange={e => handleFieldChange('MonthlyCharges', Number(e.target.value))}
                  style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  <span>$18.00 (Basic)</span>
                  <span>$70.00</span>
                  <span>$125.00 (Premium)</span>
                </div>
              </div>

              {/* Paperless Billing Toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Paperless Billing</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Customer receives digital e-invoices</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['Yes', 'No'].map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleFieldChange('PaperlessBilling', v)}
                      className={formData.PaperlessBilling === v ? 'btn btn-primary' : 'btn btn-secondary'}
                      style={{ padding: '4px 14px', fontSize: 12 }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab 2: Services & Add-ons ── */}
          {activeCategory === 'services' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Internet Service */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Internet Service Type
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['Fiber optic', 'DSL', 'No'].map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleFieldChange('InternetService', opt)}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 13,
                        fontWeight: formData.InternetService === opt ? 600 : 400,
                        border: '1px solid',
                        borderColor: formData.InternetService === opt ? 'var(--accent)' : 'var(--border)',
                        background: formData.InternetService === opt ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                        color: formData.InternetService === opt ? 'var(--accent)' : 'var(--text-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      {opt === 'No' ? 'No Internet' : opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Service Features Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { field: 'TechSupport', label: 'Tech Support', desc: 'Dedicated technical assistance' },
                  { field: 'OnlineSecurity', label: 'Online Security', desc: 'Antivirus & safe web browsing' },
                  { field: 'OnlineBackup', label: 'Online Backup', desc: 'Cloud storage backup' },
                  { field: 'DeviceProtection', label: 'Device Protection', desc: 'Hardware warranty & insurance' },
                  { field: 'StreamingTV', label: 'Streaming TV', desc: 'IPTV subscription' },
                  { field: 'StreamingMovies', label: 'Streaming Movies', desc: 'Movie streaming package' },
                ].map(svc => (
                  <div
                    key={svc.field}
                    style={{
                      background: 'var(--bg-elevated)',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{svc.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{svc.desc}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFieldChange(svc.field, formData[svc.field] === 'Yes' ? 'No' : 'Yes')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: formData[svc.field] === 'Yes' ? 'var(--risk-low)' : 'var(--border)',
                        background: formData[svc.field] === 'Yes' ? 'var(--risk-low-bg)' : 'transparent',
                        color: formData[svc.field] === 'Yes' ? 'var(--risk-low)' : 'var(--text-muted)',
                      }}
                    >
                      {formData[svc.field] === 'Yes' ? 'Active' : 'Off'}
                    </button>
                  </div>
                ))}
              </div>

              {/* Phone Service & Multiple Lines */}
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                <div style={{ flex: 1, background: 'var(--bg-elevated)', padding: '10px 12px', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Phone Service</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['Yes', 'No'].map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => handleFieldChange('PhoneService', v)}
                        className={formData.PhoneService === v ? 'btn btn-primary' : 'btn btn-secondary'}
                        style={{ flex: 1, padding: '4px 8px', fontSize: 11 }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ flex: 1, background: 'var(--bg-elevated)', padding: '10px 12px', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Multiple Lines</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['Yes', 'No'].map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => handleFieldChange('MultipleLines', v)}
                        className={formData.MultipleLines === v ? 'btn btn-primary' : 'btn btn-secondary'}
                        style={{ flex: 1, padding: '4px 8px', fontSize: 11 }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab 3: Demographics & Profile ── */}
          {activeCategory === 'demographics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Customer Identifier (Optional)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. CUST-9921 (Leave blank to auto-generate)"
                  value={formData.customer_id}
                  onChange={e => handleFieldChange('customer_id', e.target.value)}
                  style={{ width: '100%', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Gender */}
                <div style={{ background: 'var(--bg-elevated)', padding: '12px 14px', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Gender</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['Male', 'Female'].map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => handleFieldChange('gender', g)}
                        className={formData.gender === g ? 'btn btn-primary' : 'btn btn-secondary'}
                        style={{ flex: 1, padding: '6px 8px', fontSize: 12 }}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Senior Citizen */}
                <div style={{ background: 'var(--bg-elevated)', padding: '12px 14px', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Senior Citizen (65+)</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[{ label: 'Yes', val: 1 }, { label: 'No', val: 0 }].map(opt => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => handleFieldChange('SeniorCitizen', opt.val)}
                        className={formData.SeniorCitizen === opt.val ? 'btn btn-primary' : 'btn btn-secondary'}
                        style={{ flex: 1, padding: '6px 8px', fontSize: 12 }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Partner */}
                <div style={{ background: 'var(--bg-elevated)', padding: '12px 14px', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Has Partner / Spouse</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['Yes', 'No'].map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => handleFieldChange('Partner', v)}
                        className={formData.Partner === v ? 'btn btn-primary' : 'btn btn-secondary'}
                        style={{ flex: 1, padding: '6px 8px', fontSize: 12 }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dependents */}
                <div style={{ background: 'var(--bg-elevated)', padding: '12px 14px', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Has Dependents</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['Yes', 'No'].map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => handleFieldChange('Dependents', v)}
                        className={formData.Dependents === v ? 'btn btn-primary' : 'btn btn-secondary'}
                        style={{ flex: 1, padding: '6px 8px', fontSize: 12 }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Total Charges calculated: <strong>${formData.TotalCharges}</strong>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={submitting}
              style={{ padding: '8px 20px', fontWeight: 600 }}
            >
              {submitting ? 'Saving & Scoring...' : 'Save & Predict Customer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
