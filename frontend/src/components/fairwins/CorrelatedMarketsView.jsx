import { useState, useMemo } from 'react'
import { usePrice } from '../../contexts/PriceContext'
import './CorrelatedMarketsView.css'

function CorrelatedMarketsView({ market, correlatedMarkets, onTrade }) {
  const [selectedOption, setSelectedOption] = useState(market.id)
  const { formatPrice } = usePrice()

  const selectedMarket = useMemo(() => {
    return correlatedMarkets.find(m => m.id === selectedOption) || market
  }, [selectedOption, correlatedMarkets, market])

  // Prepare radar chart data
  const radarData = useMemo(() => {
    return correlatedMarkets.map(m => ({
      id: m.id,
      label: m.proposalTitle.split(':')[1]?.trim() || m.proposalTitle,
      probability: parseFloat(m.passTokenPrice) * 100,
      totalLiquidity: parseFloat(m.totalLiquidity)
    }))
  }, [correlatedMarkets])

  // Calculate radar chart points
  const calculateRadarPoints = () => {
    const centerX = 200
    const centerY = 200
    const maxRadius = 150
    const numPoints = radarData.length
    
    return radarData.map((data, index) => {
      const angle = (Math.PI * 2 * index) / numPoints - Math.PI / 2
      const radius = (data.probability / 100) * maxRadius
      const x = centerX + radius * Math.cos(angle)
      const y = centerY + radius * Math.sin(angle)
      const labelX = centerX + (maxRadius + 30) * Math.cos(angle)
      const labelY = centerY + (maxRadius + 30) * Math.sin(angle)
      
      return { x, y, labelX, labelY, angle, ...data }
    })
  }

  const points = calculateRadarPoints()

  // Create polygon path for filled area
  const radarPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'

  // Create grid circles
  const gridCircles = [0.2, 0.4, 0.6, 0.8, 1.0]

  return (
    <div className="correlated-markets-view">
      <div className="correlation-header">
        <div className="correlation-group-info">
          <span className="correlation-icon">🔗</span>
          <h2 className="correlation-group-title">{market.correlationGroupName}</h2>
        </div>
        <p className="correlation-description">
          Compare all options in this linked market group
        </p>
      </div>

      <div className="correlation-content">
        {/* Radar Chart - 75% width */}
        <div className="radar-section">
          <svg 
            className="radar-chart" 
            viewBox="0 0 400 400"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Grid circles */}
            {gridCircles.map((scale, i) => (
              <circle
                key={i}
                cx="200"
                cy="200"
                r={150 * scale}
                fill="none"
                stroke="rgba(var(--brand-primary-rgb, 54, 179, 126), 0.15)"
                strokeWidth="1"
              />
            ))}

            {/* Grid lines from center to each point */}
            {points.map((point, i) => (
              <line
                key={`line-${i}`}
                x1="200"
                y1="200"
                x2={point.labelX}
                y2={point.labelY}
                stroke="rgba(var(--brand-primary-rgb, 54, 179, 126), 0.2)"
                strokeWidth="1"
              />
            ))}

            {/* Radar polygon (filled area) */}
            <path
              d={radarPath}
              fill="rgba(var(--brand-primary-rgb, 54, 179, 126), 0.3)"
              stroke="var(--brand-primary)"
              strokeWidth="2"
            />

            {/* Data points */}
            {points.map((point, i) => (
              <g key={`point-${i}`}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="6"
                  fill={selectedOption === point.id ? 'var(--brand-primary)' : 'white'}
                  stroke="var(--brand-primary)"
                  strokeWidth="2"
                  className="radar-point"
                  onClick={() => setSelectedOption(point.id)}
                  style={{ cursor: 'pointer' }}
                />
              </g>
            ))}

            {/* Labels */}
            {points.map((point, i) => (
              <text
                key={`label-${i}`}
                x={point.labelX}
                y={point.labelY}
                textAnchor={point.labelX > 200 ? 'start' : point.labelX < 200 ? 'end' : 'middle'}
                dominantBaseline={point.labelY > 200 ? 'hanging' : point.labelY < 200 ? 'auto' : 'middle'}
                fontSize="12"
                fontWeight="600"
                fill="var(--text-primary)"
                className="radar-label"
              >
                {point.label}
              </text>
            ))}

            {/* Center logo */}
            <g transform="translate(200, 200)">
              <circle
                cx="0"
                cy="0"
                r="40"
                fill="white"
                stroke="var(--brand-primary)"
                strokeWidth="2"
              />
              {/* Clover/Four-leaf logo representation */}
              <g transform="scale(0.8)">
                <circle cx="-15" cy="0" r="12" fill="var(--brand-primary)" opacity="0.8" />
                <circle cx="15" cy="0" r="12" fill="var(--brand-primary)" opacity="0.8" />
                <circle cx="0" cy="-15" r="12" fill="var(--brand-primary)" opacity="0.8" />
                <circle cx="0" cy="15" r="12" fill="var(--brand-primary)" opacity="0.8" />
                <circle cx="0" cy="0" r="8" fill="var(--brand-primary)" />
              </g>
            </g>
          </svg>
        </div>

        {/* Options Cards - 25% width */}
        <div className="options-section">
          <h3 className="options-title">Options</h3>
          <div className="options-list">
            {correlatedMarkets.map((option) => (
              <button
                key={option.id}
                className={`option-card ${selectedOption === option.id ? 'selected' : ''}`}
                onClick={() => setSelectedOption(option.id)}
              >
                <div className="option-header">
                  <span className="option-name">
                    {option.proposalTitle.split(':')[1]?.trim() || option.proposalTitle}
                  </span>
                  {selectedOption === option.id && (
                    <span className="selected-indicator">✓</span>
                  )}
                </div>
                
                <div className="option-stats">
                  <div className="option-stat">
                    <span className="stat-label">Probability</span>
                    <span className="stat-value">{(parseFloat(option.passTokenPrice) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="option-stat">
                    <span className="stat-label">Volume</span>
                    <span className="stat-value">{formatPrice(option.totalLiquidity, { compact: true })}</span>
                  </div>
                </div>

                {/* Histogram bar showing current price */}
                <div className="price-histogram">
                  <div className="histogram-bar-container">
                    <div 
                      className="histogram-bar"
                      style={{ width: `${parseFloat(option.passTokenPrice) * 100}%` }}
                    />
                  </div>
                  <div className="histogram-labels">
                    <span className="histogram-label">0%</span>
                    <span className="histogram-label">50%</span>
                    <span className="histogram-label">100%</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Trade button for selected option */}
          <div className="trade-action">
            <button 
              className="trade-btn"
              onClick={() => onTrade && onTrade({ market: selectedMarket, type: 'PASS', amount: '100' })}
            >
              Trade on {selectedMarket.proposalTitle.split(':')[1]?.trim() || 'this option'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CorrelatedMarketsView
