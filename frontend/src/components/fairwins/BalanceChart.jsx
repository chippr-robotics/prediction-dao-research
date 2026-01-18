import { useState, useMemo } from 'react'
import { useETCswap } from '../../hooks/useETCswap'
import { TIME_HORIZONS } from '../../constants/etcswap'
import './BalanceChart.css'

// Helper function to filter history by time horizon (pure function)
const filterByHorizon = (history, horizonSeconds) => {
  if (!history || history.length === 0) return []
  if (horizonSeconds === 0) return history // ALL
  const cutoff = Date.now() - (horizonSeconds * 1000)
  return history.filter(entry => entry.timestamp >= cutoff)
}

function BalanceChart() {
  const { balanceHistory } = useETCswap()
  const [selectedHorizon, setSelectedHorizon] = useState('24H')
  const [selectedToken, setSelectedToken] = useState('all')

  // Filter balance history based on selected time horizon
  // Not memoized since filtering is simple and we need current time
  const horizonSeconds = TIME_HORIZONS[selectedHorizon]
  const filteredHistory = filterByHorizon(balanceHistory, horizonSeconds)
  
  // Calculate chart data
  const chartData = useMemo(() => {
    if (filteredHistory.length === 0) return null
    
    const maxValue = Math.max(
      ...filteredHistory.map(entry => 
        parseFloat(entry.etc) + parseFloat(entry.wetc) + parseFloat(entry.usc)
      )
    )
    
    return {
      maxValue,
      points: filteredHistory.map((entry, index) => ({
        ...entry,
        x: (index / Math.max(filteredHistory.length - 1, 1)) * 100,
        etcY: (parseFloat(entry.etc) / maxValue) * 100,
        wetcY: (parseFloat(entry.wetc) / maxValue) * 100,
        uscY: (parseFloat(entry.usc) / maxValue) * 100
      }))
    }
  }, [filteredHistory])
  
  // Format timestamp for display
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  
  if (!balanceHistory || balanceHistory.length === 0) {
    return (
      <div className="balance-chart">
        <h3>Balance History</h3>
        <div className="no-data-message">
          <p>No balance history available yet.</p>
          <p className="help-text">Balance data will appear here as you use the platform.</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="balance-chart">
      <div className="chart-header">
        <h3>Balance History</h3>
        <div className="chart-controls">
          {/* Time Horizon Selector */}
          <div className="horizon-selector">
            {Object.keys(TIME_HORIZONS).map(horizon => (
              <button
                key={horizon}
                className={`horizon-btn ${selectedHorizon === horizon ? 'active' : ''}`}
                onClick={() => setSelectedHorizon(horizon)}
                aria-pressed={selectedHorizon === horizon}
              >
                {horizon}
              </button>
            ))}
          </div>
          
          {/* Token Filter */}
          <select
            value={selectedToken}
            onChange={(e) => setSelectedToken(e.target.value)}
            className="token-filter"
            aria-label="Filter by token"
          >
            <option value="all">All Tokens</option>
            <option value="etc">ETC</option>
            <option value="wetc">WETC</option>
            <option value="usc">USC</option>
          </select>
        </div>
      </div>
      
      {chartData && chartData.points.length > 0 ? (
        <div className="chart-container">
          <svg
            className="chart-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-label="Balance history chart"
          >
            {/* Grid lines */}
            <line x1="0" y1="25" x2="100" y2="25" className="grid-line" />
            <line x1="0" y1="50" x2="100" y2="50" className="grid-line" />
            <line x1="0" y1="75" x2="100" y2="75" className="grid-line" />
            
            {/* ETC line */}
            {(selectedToken === 'all' || selectedToken === 'etc') && (
              <polyline
                points={chartData.points
                  .map(p => `${p.x},${100 - p.etcY}`)
                  .join(' ')}
                className="chart-line etc-line"
                fill="none"
              />
            )}
            
            {/* WETC line */}
            {(selectedToken === 'all' || selectedToken === 'wetc') && (
              <polyline
                points={chartData.points
                  .map(p => `${p.x},${100 - p.wetcY}`)
                  .join(' ')}
                className="chart-line wetc-line"
                fill="none"
              />
            )}
            
            {/* USC line */}
            {(selectedToken === 'all' || selectedToken === 'usc') && (
              <polyline
                points={chartData.points
                  .map(p => `${p.x},${100 - p.uscY}`)
                  .join(' ')}
                className="chart-line usc-line"
                fill="none"
              />
            )}
          </svg>
          
          {/* Legend */}
          <div className="chart-legend">
            {(selectedToken === 'all' || selectedToken === 'etc') && (
              <div className="legend-item">
                <span className="legend-color etc-color"></span>
                <span>ETC</span>
              </div>
            )}
            {(selectedToken === 'all' || selectedToken === 'wetc') && (
              <div className="legend-item">
                <span className="legend-color wetc-color"></span>
                <span>WETC</span>
              </div>
            )}
            {(selectedToken === 'all' || selectedToken === 'usc') && (
              <div className="legend-item">
                <span className="legend-color usc-color"></span>
                <span>USC</span>
              </div>
            )}
          </div>
          
          {/* Time labels */}
          {filteredHistory.length > 0 && (
            <div className="time-labels">
              <span>{formatTimestamp(filteredHistory[0].timestamp)}</span>
              <span>{formatTimestamp(filteredHistory[filteredHistory.length - 1].timestamp)}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="no-data-message">
          <p>No data available for selected time range.</p>
        </div>
      )}
    </div>
  )
}

export default BalanceChart
