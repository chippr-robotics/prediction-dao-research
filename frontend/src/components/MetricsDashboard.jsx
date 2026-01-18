import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import './MetricsDashboard.css'
import { useEthers } from '../hooks/useWeb3'

const WelfareMetricRegistryABI = [
  "function getActiveMetrics() external view returns (uint256[])",
  "function getMetric(uint256 metricId) external view returns (tuple(string name, string description, uint256 weight, uint8 category, bool active, uint256 activatedAt))",
  "function getAggregatedMetrics() external view returns (tuple(uint256 governanceScore, uint256 financialScore, uint256 bettingScore, uint256 privateSectorScore, uint256 overallScore, uint256 timestamp))",
  "function getMetricsByCategory(uint8 category) external view returns (uint256[])"
]

function MetricsDashboard({ daos }) {
  const { provider } = useEthers()
  const [metrics, setMetrics] = useState([])
  const [aggregatedMetrics, setAggregatedMetrics] = useState(null)
  const [selectedDAO, setSelectedDAO] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (provider && daos.length > 0) {
      setSelectedDAO(daos[0])
    }
  }, [provider, daos])

  useEffect(() => {
    if (selectedDAO) {
      loadMetrics()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDAO])

  const loadMetrics = async () => {
    try {
      setLoading(true)
      const registry = new ethers.Contract(
        selectedDAO.welfareRegistry,
        WelfareMetricRegistryABI,
        provider
      )

      // Get active metrics
      const activeMetricIds = await registry.getActiveMetrics()
      
      // Load metric details
      const metricsData = []
      for (let i = 0; i < activeMetricIds.length; i++) {
        const metric = await registry.getMetric(activeMetricIds[i])
        metricsData.push({
          id: activeMetricIds[i].toString(),
          ...metric
        })
      }
      
      setMetrics(metricsData)

      // Get aggregated metrics
      try {
        const aggregated = await registry.getAggregatedMetrics()
        setAggregatedMetrics(aggregated)
      } catch (err) {
        console.error('Error loading aggregated metrics:', err)
      }

    } catch (error) {
      console.error('Error loading metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  const getCategoryName = (category) => {
    const categories = ['Governance', 'Financial', 'Betting', 'Private Sector']
    return categories[category] || 'Unknown'
  }

  const getCategoryIcon = (category) => {
    const icons = ['🏛️', '💰', '📊', '🏢']
    return icons[category] || '📈'
  }

  const getCategoryColor = (category) => {
    const colors = ['#667eea', '#10b981', '#f59e0b', '#ec4899']
    return colors[category] || '#61dafb'
  }

  const formatScore = (score) => {
    return score ? Number(score).toLocaleString() : '0'
  }

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner"></div>
        <p>Loading metrics...</p>
      </div>
    )
  }

  return (
    <div className="metrics-dashboard">
      <div className="dao-selector">
        <label>Select DAO:</label>
        <select 
          value={selectedDAO?.id || ''} 
          onChange={(e) => {
            const dao = daos.find(d => d.id === e.target.value)
            setSelectedDAO(dao)
          }}
        >
          {daos.map(dao => (
            <option key={dao.id} value={dao.id}>
              {dao.name}
            </option>
          ))}
        </select>
      </div>

      {aggregatedMetrics && (
        <div className="aggregated-section">
          <h3>Overall Performance</h3>
          
          {/* Visual Score Chart */}
          <div className="score-chart">
            <div className="chart-bar-group">
              <div className="chart-bar-item">
                <div className="chart-bar-label">
                  <span className="chart-icon" aria-hidden="true">🏛️</span>
                  <span>Governance</span>
                </div>
                <div className="chart-bar-container">
                  <div 
                    className="chart-bar governance"
                    style={{ width: `${Math.min((Number(aggregatedMetrics.governanceScore) / 10000) * 100, 100)}%` }}
                    role="progressbar"
                    aria-valuenow={Number(aggregatedMetrics.governanceScore)}
                    aria-valuemin="0"
                    aria-valuemax="10000"
                    aria-label={`Governance score: ${formatScore(aggregatedMetrics.governanceScore)}`}
                  >
                    <span className="chart-bar-value">{formatScore(aggregatedMetrics.governanceScore)}</span>
                  </div>
                </div>
              </div>

              <div className="chart-bar-item">
                <div className="chart-bar-label">
                  <span className="chart-icon" aria-hidden="true">💰</span>
                  <span>Financial</span>
                </div>
                <div className="chart-bar-container">
                  <div 
                    className="chart-bar financial"
                    style={{ width: `${Math.min((Number(aggregatedMetrics.financialScore) / 10000) * 100, 100)}%` }}
                    role="progressbar"
                    aria-valuenow={Number(aggregatedMetrics.financialScore)}
                    aria-valuemin="0"
                    aria-valuemax="10000"
                    aria-label={`Financial score: ${formatScore(aggregatedMetrics.financialScore)}`}
                  >
                    <span className="chart-bar-value">{formatScore(aggregatedMetrics.financialScore)}</span>
                  </div>
                </div>
              </div>

              <div className="chart-bar-item">
                <div className="chart-bar-label">
                  <span className="chart-icon" aria-hidden="true">📊</span>
                  <span>Betting</span>
                </div>
                <div className="chart-bar-container">
                  <div 
                    className="chart-bar betting"
                    style={{ width: `${Math.min((Number(aggregatedMetrics.bettingScore) / 10000) * 100, 100)}%` }}
                    role="progressbar"
                    aria-valuenow={Number(aggregatedMetrics.bettingScore)}
                    aria-valuemin="0"
                    aria-valuemax="10000"
                    aria-label={`Betting score: ${formatScore(aggregatedMetrics.bettingScore)}`}
                  >
                    <span className="chart-bar-value">{formatScore(aggregatedMetrics.bettingScore)}</span>
                  </div>
                </div>
              </div>

              <div className="chart-bar-item">
                <div className="chart-bar-label">
                  <span className="chart-icon" aria-hidden="true">🏢</span>
                  <span>Private Sector</span>
                </div>
                <div className="chart-bar-container">
                  <div 
                    className="chart-bar private"
                    style={{ width: `${Math.min((Number(aggregatedMetrics.privateSectorScore) / 10000) * 100, 100)}%` }}
                    role="progressbar"
                    aria-valuenow={Number(aggregatedMetrics.privateSectorScore)}
                    aria-valuemin="0"
                    aria-valuemax="10000"
                    aria-label={`Private sector score: ${formatScore(aggregatedMetrics.privateSectorScore)}`}
                  >
                    <span className="chart-bar-value">{formatScore(aggregatedMetrics.privateSectorScore)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="score-grid">
            <div className="score-card overall">
              <div className="score-icon">⭐</div>
              <div className="score-content">
                <span className="score-label">Overall Score</span>
                <span className="score-value">{formatScore(aggregatedMetrics.overallScore)}</span>
              </div>
            </div>

            <div className="score-card governance">
              <div className="score-icon">🏛️</div>
              <div className="score-content">
                <span className="score-label">Governance</span>
                <span className="score-value">{formatScore(aggregatedMetrics.governanceScore)}</span>
              </div>
            </div>

            <div className="score-card financial">
              <div className="score-icon">💰</div>
              <div className="score-content">
                <span className="score-label">Financial</span>
                <span className="score-value">{formatScore(aggregatedMetrics.financialScore)}</span>
              </div>
            </div>

            <div className="score-card betting">
              <div className="score-icon">📊</div>
              <div className="score-content">
                <span className="score-label">Betting</span>
                <span className="score-value">{formatScore(aggregatedMetrics.bettingScore)}</span>
              </div>
            </div>

            <div className="score-card private">
              <div className="score-icon">🏢</div>
              <div className="score-content">
                <span className="score-label">Private Sector</span>
                <span className="score-value">{formatScore(aggregatedMetrics.privateSectorScore)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="metrics-section">
        <h3>Active Welfare Metrics</h3>
        
        {metrics.length === 0 ? (
          <div className="empty-metrics">
            <div className="empty-icon">📊</div>
            <p>No active metrics found for this DAO</p>
          </div>
        ) : (
          <div className="metrics-list">
            {metrics.map((metric) => (
              <div 
                key={metric.id} 
                className="metric-card"
                style={{ borderLeftColor: getCategoryColor(metric.category) }}
              >
                <div className="metric-header">
                  <div className="metric-title">
                    <span className="metric-icon">{getCategoryIcon(metric.category)}</span>
                    <h4>{metric.name}</h4>
                  </div>
                  <span 
                    className="category-badge"
                    style={{ backgroundColor: `${getCategoryColor(metric.category)}33` }}
                  >
                    {getCategoryName(metric.category)}
                  </span>
                </div>

                <p className="metric-description">{metric.description}</p>

                <div className="metric-footer">
                  <div className="metric-weight">
                    <span className="weight-label">Weight:</span>
                    <span className="weight-value">{Number(metric.weight) / 100}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="info-section">
        <h4>📈 About Multi-Metric Analytics</h4>
        <p>
          This dashboard provides institutional-grade performance metrics across multiple categories:
        </p>
        <ul>
          <li><strong>Governance Metrics:</strong> On-chain governance activity, proposal participation, voting power distribution</li>
          <li><strong>Financial Metrics:</strong> Revenue, profit, ROI, and treasury value (similar to private company metrics)</li>
          <li><strong>Betting Metrics:</strong> Prediction market volume, accuracy, and liquidity</li>
          <li><strong>Private Sector Metrics:</strong> Traditional performance indicators for accredited investor decision-making</li>
        </ul>
      </div>
    </div>
  )
}

export default MetricsDashboard
