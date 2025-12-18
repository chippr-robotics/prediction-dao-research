import { useState, useEffect } from 'react'

function WelfareMetrics({ provider, signer }) {
  const [metrics, setMetrics] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMetrics()
  }, [provider])

  const loadMetrics = async () => {
    try {
      // Mock data for demonstration
      // In production, this would fetch from WelfareMetricRegistry contract
      const mockMetrics = [
        {
          id: 0,
          name: 'Treasury Value',
          description: 'Time-weighted average price of total treasury holdings',
          weight: 5000,
          active: true,
          currentValue: '$12,450,000'
        },
        {
          id: 1,
          name: 'Network Activity',
          description: 'Composite index of transaction count and active addresses',
          weight: 3000,
          active: true,
          currentValue: '87.5 (normalized)'
        },
        {
          id: 2,
          name: 'Hash Rate Security',
          description: 'Network hash rate normalized against other PoW chains',
          weight: 1500,
          active: true,
          currentValue: '0.042 (relative)'
        },
        {
          id: 3,
          name: 'Developer Activity',
          description: 'Weighted measure of GitHub commits and contributors',
          weight: 500,
          active: true,
          currentValue: '142 (score)'
        }
      ]

      setMetrics(mockMetrics)
      setLoading(false)
    } catch (error) {
      console.error('Error loading metrics:', error)
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="loading">Loading welfare metrics...</div>
  }

  return (
    <div className="welfare-metrics">
      <div className="metrics-grid">
        {metrics.map((metric) => (
          <div key={metric.id} className="metric-card">
            <div className="metric-header">
              <h3>{metric.name}</h3>
              {metric.active && <span className="active-badge">Active</span>}
            </div>
            
            <p className="metric-description">{metric.description}</p>
            
            <div className="metric-stats">
              <div className="stat">
                <label>Current Value</label>
                <div className="value">{metric.currentValue}</div>
              </div>
              <div className="stat">
                <label>Weight</label>
                <div className="value">{(metric.weight / 100).toFixed(1)}%</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="metrics-info">
        <h4>About Welfare Metrics</h4>
        <p>
          Welfare metrics are democratically-selected indicators of protocol success. 
          Prediction markets use these metrics to evaluate proposals. Higher predicted 
          welfare metric values indicate markets believe the proposal will benefit the protocol.
        </p>
      </div>
    </div>
  )
}

export default WelfareMetrics
