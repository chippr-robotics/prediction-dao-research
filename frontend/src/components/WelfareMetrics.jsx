import { useState, useEffect } from 'react'
import { getMockWelfareMetrics } from '../utils/mockDataLoader'

function WelfareMetrics({ provider, signer }) {
  const [metrics, setMetrics] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMetrics()
  }, [provider])

  const loadMetrics = async () => {
    try {
      // Load mock data from centralized source
      // In production, this would fetch from WelfareMetricRegistry contract
      const mockMetrics = getMockWelfareMetrics()

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
