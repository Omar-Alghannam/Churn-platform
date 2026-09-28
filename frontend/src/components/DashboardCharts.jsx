import { useMemo } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts'

const RISK_COLORS = {
  High: '#ff4d6d',
  Medium: '#ff9f43',
  Low: '#20d489',
}

const STATUS_COLORS = {
  'Not Contacted': '#8b9ab5',
  'Contacted': '#00d4ff',
  'Converted': '#20d489',
  'Lost': '#ff4d6d',
}

export default function DashboardCharts({ customers, stats }) {
  // 1. Risk Tier Pie Data
  const riskData = useMemo(() => {
    if (!stats) return []
    return [
      { name: 'High', value: stats.high_risk_count, color: RISK_COLORS.High },
      { name: 'Medium', value: stats.medium_risk_count, color: RISK_COLORS.Medium },
      { name: 'Low', value: stats.low_risk_count, color: RISK_COLORS.Low },
    ].filter(d => d.value > 0)
  }, [stats])

  // 2. Risk by Contract Type
  const contractData = useMemo(() => {
    if (!customers || customers.length === 0) return []
    const groups = {}

    customers.forEach(c => {
      const contract = c.raw_data?.Contract || 'Unknown'
      if (!groups[contract]) {
        groups[contract] = { contract, total: 0, highRisk: 0, sumRisk: 0 }
      }
      groups[contract].total += 1
      groups[contract].sumRisk += (c.risk_score || 0)
      if ((c.risk_score || 0) >= 70) {
        groups[contract].highRisk += 1
      }
    })

    return Object.values(groups).map(g => ({
      name: g.contract,
      'Avg Risk Score': Math.round(g.sumRisk / g.total),
      'High Risk Count': g.highRisk,
      'Total Customers': g.total,
    }))
  }, [customers])

  // 3. Contact Progress Data
  const statusData = useMemo(() => {
    if (!customers || customers.length === 0) return []
    const counts = {
      'Not Contacted': 0,
      'Contacted': 0,
      'Converted': 0,
      'Lost': 0,
    }

    customers.forEach(c => {
      const s = c.contact_status || 'not_contacted'
      if (s === 'not_contacted') counts['Not Contacted'] += 1
      else if (s === 'contacted') counts['Contacted'] += 1
      else if (s === 'converted') counts['Converted'] += 1
      else if (s === 'lost') counts['Lost'] += 1
    })

    return Object.entries(counts).map(([name, count]) => ({
      name,
      Count: count,
      color: STATUS_COLORS[name],
    }))
  }, [customers])

  if (!customers || customers.length === 0) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>
      {/* Risk Distribution Donut */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
          Risk Level Distribution
        </h3>
        <div style={{ height: 220, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={riskData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={4}
                dataKey="value"
              >
                {riskData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1a2236', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }}
              />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Avg Risk by Contract Type */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
          Churn Risk by Contract Type
        </h3>
        <div style={{ height: 220, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={contractData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="#8b9ab5" fontSize={12} />
              <YAxis stroke="#8b9ab5" fontSize={12} />
              <Tooltip
                contentStyle={{ background: '#1a2236', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }}
              />
              <Bar dataKey="Avg Risk Score" fill="#00d4ff" radius={[4, 4, 0, 0]} />
              <Bar dataKey="High Risk Count" fill="#ff4d6d" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Contact Status Funnel */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
          Retention Team Action Tracker
        </h3>
        <div style={{ height: 220, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData} layout="vertical" margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis type="number" stroke="#8b9ab5" fontSize={12} />
              <YAxis dataKey="name" type="category" stroke="#8b9ab5" fontSize={12} />
              <Tooltip
                contentStyle={{ background: '#1a2236', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }}
              />
              <Bar dataKey="Count" radius={[0, 4, 4, 0]}>
                {statusData.map((entry, index) => (
                  <Cell key={`status-cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
