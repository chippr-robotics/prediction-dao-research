import { useState, useMemo, useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { usePrice } from '../../contexts/PriceContext'
import './CorrelatedMarketsView.css'

function CorrelatedMarketsView({ market, correlatedMarkets, onTrade }) {
  const [selectedOption, setSelectedOption] = useState(market.id)
  const { formatPrice } = usePrice()
  const svgRef = useRef(null)

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

  // Create radar chart using D3.js
  useEffect(() => {
    if (!svgRef.current || radarData.length === 0) return

    const width = 500
    const height = 500
    const centerX = width / 2
    const centerY = height / 2
    const maxRadius = 150 // Exterior is 100%
    const levels = 5 // Number of concentric circles
    const angleSlice = (Math.PI * 2) / radarData.length

    // Clear previous content
    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)

    // Create main group
    const g = svg.append('g')
      .attr('transform', `translate(${centerX},${centerY})`)

    // Draw concentric circles (grid)
    const gridLevels = d3.range(1, levels + 1).reverse()
    gridLevels.forEach((level) => {
      g.append('circle')
        .attr('r', (maxRadius / levels) * level)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(54, 179, 126, 0.15)')
        .attr('stroke-width', 1)
    })

    // Draw radial axes
    radarData.forEach((d, i) => {
      const angle = angleSlice * i - Math.PI / 2
      const lineCoord = {
        x: maxRadius * Math.cos(angle),
        y: maxRadius * Math.sin(angle)
      }

      g.append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', lineCoord.x)
        .attr('y2', lineCoord.y)
        .attr('stroke', 'rgba(54, 179, 126, 0.2)')
        .attr('stroke-width', 1)
    })

    // Create data polygon
    const radarLine = d3.lineRadial()
      .angle((d, i) => angleSlice * i)
      .radius(d => (d.probability / 100) * maxRadius)
      .curve(d3.curveLinearClosed)

    g.append('path')
      .datum(radarData)
      .attr('d', radarLine)
      .attr('fill', 'rgba(54, 179, 126, 0.3)')
      .attr('stroke', 'rgba(54, 179, 126, 1)')
      .attr('stroke-width', 2)

    // Draw data points
    radarData.forEach((d, i) => {
      const angle = angleSlice * i - Math.PI / 2
      const radius = (d.probability / 100) * maxRadius
      const x = radius * Math.cos(angle)
      const y = radius * Math.sin(angle)

      g.append('circle')
        .attr('cx', x)
        .attr('cy', y)
        .attr('r', selectedOption === d.id ? 8 : 6)
        .attr('fill', selectedOption === d.id ? 'rgba(54, 179, 126, 1)' : 'white')
        .attr('stroke', 'rgba(54, 179, 126, 1)')
        .attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .on('click', () => setSelectedOption(d.id))
        .on('mouseover', function() {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', 10)
        })
        .on('mouseout', function() {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', selectedOption === d.id ? 8 : 6)
        })
    })

    // Draw labels around the perimeter
    radarData.forEach((d, i) => {
      const angle = angleSlice * i - Math.PI / 2
      const labelRadius = maxRadius + 40
      const x = labelRadius * Math.cos(angle)
      const y = labelRadius * Math.sin(angle)

      g.append('text')
        .attr('x', x)
        .attr('y', y)
        .attr('text-anchor', x > 0.5 ? 'start' : x < -0.5 ? 'end' : 'middle')
        .attr('dominant-baseline', y > 0.5 ? 'hanging' : y < -0.5 ? 'auto' : 'middle')
        .attr('font-size', '14px')
        .attr('font-weight', '600')
        .attr('fill', 'var(--text-primary)')
        .text(d.label)
    })

    // Add percentage labels on circles
    gridLevels.forEach((level) => {
      const percentage = (level / levels) * 100
      g.append('text')
        .attr('x', 5)
        .attr('y', -(maxRadius / levels) * level)
        .attr('font-size', '10px')
        .attr('fill', 'var(--text-secondary)')
        .text(`${percentage}%`)
    })

    // Embed SVG logo in center
    fetch('/docs/assets/logo_fairwins.svg')
      .then(response => response.text())
      .then(svgText => {
        const logoSize = 80
        const logoGroup = g.append('g')
          .attr('transform', `translate(${-logoSize/2}, ${-logoSize/2})`)
        
        logoGroup.html(svgText)
          .select('svg')
          .attr('width', logoSize)
          .attr('height', logoSize)
      })
      .catch(() => {
        // Fallback: Draw clover logo if SVG fetch fails
        const cloverSize = 40
        const cloverGroup = g.append('g')
        
        // Background circle
        cloverGroup.append('circle')
          .attr('r', cloverSize)
          .attr('fill', 'white')
          .attr('stroke', 'rgba(54, 179, 126, 1)')
          .attr('stroke-width', 2)

        // Four-leaf clover design
        const leafPositions = [
          { x: 0, y: -15 },
          { x: 15, y: 0 },
          { x: 0, y: 15 },
          { x: -15, y: 0 }
        ]

        leafPositions.forEach(pos => {
          cloverGroup.append('circle')
            .attr('cx', pos.x)
            .attr('cy', pos.y)
            .attr('r', 12)
            .attr('fill', 'rgba(54, 179, 126, 0.8)')
        })

        cloverGroup.append('circle')
          .attr('r', 8)
          .attr('fill', 'rgba(54, 179, 126, 1)')
      })

  }, [radarData, selectedOption])

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
          <svg ref={svgRef} className="radar-chart"></svg>
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
