import { useState, useMemo, useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { usePrice } from '../../contexts/PriceContext'
import './CorrelatedMarketsModal.css'

// Time horizon configurations
const TIME_HORIZONS = {
  '7d': { label: '7 Days', dataPoints: 7 },
  '30d': { label: '30 Days', dataPoints: 30 },
  '90d': { label: '90 Days', dataPoints: 90 },
  'all': { label: 'All Time', dataPoints: 365 }
}

// Utility function to parse proposal title
const parseProposalTitle = (title) => {
  return title.split(':')[1]?.trim() || title
}

function CorrelatedMarketsModal({ isOpen, onClose, market, correlatedMarkets, onTrade, onOpenMarket }) {
  const [selectedOption, setSelectedOption] = useState(market?.id)
  const [visibleMarkets, setVisibleMarkets] = useState(
    correlatedMarkets?.reduce((acc, m) => ({ ...acc, [m.id]: true }), {}) || {}
  )
  const [timeHorizon, setTimeHorizon] = useState('7d') // 7d, 30d, 90d, all
  const [lastTap, setLastTap] = useState({ marketId: null, timestamp: 0 })
  const { formatPrice } = usePrice()
  const svgRef = useRef(null)
  const timelineRef = useRef(null)
  const modalRef = useRef(null)

  // useMemo hooks must be called unconditionally before any early returns
  const selectedMarket = useMemo(() => {
    if (!correlatedMarkets || !market) return null
    return correlatedMarkets.find(m => m.id === selectedOption) || market
  }, [selectedOption, correlatedMarkets, market])

  // Prepare radar chart data (only visible markets)
  const radarData = useMemo(() => {
    if (!correlatedMarkets || correlatedMarkets.length === 0) return []
    
    return correlatedMarkets
      .filter(m => m && m.id && visibleMarkets[m.id])
      .map(m => ({
        id: m.id,
        label: parseProposalTitle(m.proposalTitle || ''),
        probability: parseFloat(m.passTokenPrice || 0) * 100,
        totalLiquidity: parseFloat(m.totalLiquidity || 0)
      }))
  }, [correlatedMarkets, visibleMarkets])

  // Update selected option when market changes
  useEffect(() => {
    if (market) {
      setSelectedOption(market.id)
    }
  }, [market])

  // Update visible markets when correlatedMarkets changes
  useEffect(() => {
    if (correlatedMarkets) {
      setVisibleMarkets(
        correlatedMarkets.reduce((acc, m) => ({ ...acc, [m.id]: true }), {})
      )
    }
  }, [correlatedMarkets])

  // Handle Escape key press
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // Focus management
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll(
        'button, [tabindex]:not([tabindex="-1"])'
      )
      if (focusableElements.length > 0) {
        focusableElements[0].focus()
      }
    }
  }, [isOpen])

  // Create radar chart using D3.js
  useEffect(() => {
    if (!svgRef.current || radarData.length === 0) return

    const width = 350
    const height = 350
    const centerX = width / 2
    const centerY = height / 2
    const maxRadius = 120
    const levels = 5
    const angleSlice = (Math.PI * 2) / radarData.length

    // Calculate dynamic scale based on market probabilities
    const probabilities = radarData.map(d => d.probability)
    const avgProb = probabilities.reduce((a, b) => a + b, 0) / probabilities.length
    const maxProb = Math.max(...probabilities)
    const minProb = Math.min(...probabilities)
    const range = maxProb - minProb
    
    let scaleMin = 0
    let scaleMax = 100
    
    if (range < 20 && range > 0) {
      const padding = Math.max(range * 0.5, 5)
      scaleMin = Math.max(0, avgProb - padding - range / 2)
      scaleMax = Math.min(100, avgProb + padding + range / 2)
    }
    
    const scaleRange = scaleMax - scaleMin

    // Clear previous content
    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)

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
      
      const labelValue = scaleMin + (scaleRange / levels) * level
      g.append('text')
        .attr('x', 5)
        .attr('y', -(maxRadius / levels) * level + 5)
        .attr('font-size', '12px')
        .attr('fill', 'rgba(54, 179, 126, 0.6)')
        .text(`${labelValue.toFixed(0)}%`)
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

    // Create enhanced data with anchor points for petal effect
    const enhancedData = []
    const innerCircleRadius = 0.15
    
    radarData.forEach((d, i) => {
      const radius = scaleRange > 0 ? (d.probability - scaleMin) / scaleRange : 0.5
      
      enhancedData.push({
        angle: angleSlice * i,
        radius: radius,
        label: d.label  // Fixed: use label instead of name
      })
      
      enhancedData.push({
        angle: angleSlice * i + angleSlice / 2,
        radius: innerCircleRadius,
        label: null  // Anchor point, not a real market
      })
    })
    
    // Create data polygon with smooth curves
    const radarLine = d3.lineRadial()
      .angle(d => d.angle)
      .radius(d => d.radius * maxRadius)
      .curve(d3.curveCatmullRomClosed.alpha(0.5))

    g.append('path')
      .datum(enhancedData)
      .attr('d', radarLine)
      .attr('fill', 'rgba(54, 179, 126, 0.3)')
      .attr('stroke', 'rgba(54, 179, 126, 1)')
      .attr('stroke-width', 2)

    // Draw data points
    radarData.forEach((d, i) => {
      const angle = angleSlice * i - Math.PI / 2
      const normalizedRadius = scaleRange > 0 ? (d.probability - scaleMin) / scaleRange : 0.5
      const radius = normalizedRadius * maxRadius
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

    // Draw labels
    const labelsGroup = g.append('g')
      .attr('class', 'radar-labels-group')
      .style('pointer-events', 'none')
    
    radarData.forEach((d, i) => {
      const angle = angleSlice * i - Math.PI / 2
      const labelRadius = maxRadius + 30
      const x = labelRadius * Math.cos(angle)
      const y = labelRadius * Math.sin(angle)

      labelsGroup.append('text')
        .attr('x', x)
        .attr('y', y)
        .attr('text-anchor', x > 0.5 ? 'start' : x < -0.5 ? 'end' : 'middle')
        .attr('dominant-baseline', y > 0.5 ? 'hanging' : y < -0.5 ? 'auto' : 'middle')
        .attr('font-size', '12px')
        .attr('font-weight', '600')
        .attr('fill', 'var(--text-primary)')
        .style('paint-order', 'stroke fill')
        .style('stroke', 'white')
        .style('stroke-width', '3px')
        .style('stroke-linejoin', 'round')
        .text(d.label)
    })

  }, [radarData, selectedOption])

  // Create timeline chart using D3.js
  useEffect(() => {
    if (!timelineRef.current || radarData.length === 0) return

    const width = 900
    const height = 200
    const margin = { top: 20, right: 80, bottom: 40, left: 60 }
    const chartWidth = width - margin.left - margin.right
    const chartHeight = height - margin.top - margin.bottom

    // Clear previous content
    d3.select(timelineRef.current).selectAll('*').remove()

    const svg = d3.select(timelineRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Generate timeline data for each visible market
    const allTimelines = radarData.map(market => ({
      id: market.id,
      label: market.label,
      data: generateTimelineData(
        correlatedMarkets.find(m => m.id === market.id),
        timeHorizon
      )
    }))

    // Create scales
    const allDates = allTimelines.flatMap(t => t.data.map(d => d.date))
    const xScale = d3.scaleTime()
      .domain(d3.extent(allDates))
      .range([0, chartWidth])

    const allProbabilities = allTimelines.flatMap(t => t.data.map(d => d.probability))
    const minProb = Math.min(...allProbabilities)
    const maxProb = Math.max(...allProbabilities)
    const probRange = maxProb - minProb
    
    const padding = Math.max(probRange * 0.1, 5)
    const yMin = Math.max(0, minProb - padding)
    const yMax = Math.min(100, maxProb + padding)
    
    const yScale = d3.scaleLinear()
      .domain([yMin, yMax])
      .range([chartHeight, 0])

    // Color scale
    const colorScale = d3.scaleOrdinal()
      .domain(radarData.map(d => d.id))
      .range(d3.schemeCategory10)

    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .ticks(timeHorizon === '7d' ? 7 : timeHorizon === '30d' ? 6 : 5)
      .tickFormat(d3.timeFormat('%m/%d'))

    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickFormat(d => `${d}%`)

    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(xAxis)
      .style('color', 'var(--text-secondary)')

    g.append('g')
      .call(yAxis)
      .style('color', 'var(--text-secondary)')

    // Draw lines for each market
    const line = d3.line()
      .x(d => xScale(d.date))
      .y(d => yScale(d.probability))
      .curve(d3.curveMonotoneX)

    allTimelines.forEach(timeline => {
      g.append('path')
        .datum(timeline.data)
        .attr('fill', 'none')
        .attr('stroke', colorScale(timeline.id))
        .attr('stroke-width', timeline.id === selectedOption ? 3 : 2)
        .attr('opacity', timeline.id === selectedOption ? 1 : 0.6)
        .attr('d', line)
        .style('cursor', 'pointer')
        .on('click', () => setSelectedOption(timeline.id))
        .on('mouseover', function() {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('stroke-width', 3)
            .attr('opacity', 1)
        })
        .on('mouseout', function() {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('stroke-width', timeline.id === selectedOption ? 3 : 2)
            .attr('opacity', timeline.id === selectedOption ? 1 : 0.6)
        })

      // Add end point label
      const lastPoint = timeline.data[timeline.data.length - 1]
      g.append('text')
        .attr('x', chartWidth + 5)
        .attr('y', yScale(lastPoint.probability))
        .attr('dy', '0.35em')
        .attr('font-size', '11px')
        .attr('fill', colorScale(timeline.id))
        .style('font-weight', timeline.id === selectedOption ? 'bold' : 'normal')
        .text(timeline.label)
    })

    // Add grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .call(d3.axisLeft(yScale)
        .ticks(5)
        .tickSize(-chartWidth)
        .tickFormat('')
      )

  }, [radarData, timeHorizon, selectedOption, correlatedMarkets])

  // All hooks must be called before any conditional returns
  // Now we can safely return null if conditions aren't met
  if (!isOpen || !market) return null
  
  // Handle case where correlatedMarkets is not provided or empty
  if (!correlatedMarkets || correlatedMarkets.length === 0) {
    return null
  }

  // Toggle market visibility
  const toggleMarketVisibility = (marketId) => {
    setVisibleMarkets(prev => ({ ...prev, [marketId]: !prev[marketId] }))
  }

  // Handle double tap to open market modal
  const handleMarketCardClick = (marketId) => {
    const now = Date.now()
    const DOUBLE_TAP_DELAY = 300 // milliseconds
    
    if (lastTap.marketId === marketId && (now - lastTap.timestamp) < DOUBLE_TAP_DELAY) {
      // Double tap detected - open market modal
      const selectedMarket = correlatedMarkets.find(m => m.id === marketId)
      if (selectedMarket && onOpenMarket) {
        onOpenMarket(selectedMarket)
      }
      setLastTap({ marketId: null, timestamp: 0 })
    } else {
      // Single tap - select the option
      setSelectedOption(marketId)
      setLastTap({ marketId, timestamp: now })
    }
  }

  // Generate mock historical data for timeline
  const generateTimelineData = (market, horizon) => {
    const now = Date.now()
    const dataPoints = TIME_HORIZONS[horizon]?.dataPoints || 7
    const dayMs = 24 * 60 * 60 * 1000
    const baseProb = parseFloat(market.passTokenPrice) * 100
    
    return Array.from({ length: dataPoints }, (_, i) => ({
      date: new Date(now - (dataPoints - i - 1) * dayMs),
      probability: baseProb + (Math.random() - 0.5) * 15 // Mock variance
    }))
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div 
      className="correlated-markets-modal-backdrop" 
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="correlated-markets-modal-title"
    >
      <div 
        ref={modalRef}
        className="correlated-markets-modal-container"
      >
        <div className="correlated-markets-modal">
          {/* Header */}
          <div className="correlated-modal-header">
            <img 
              src="/assets/fairwins_no-text_logo.svg" 
              alt="FairWins" 
              className="correlated-modal-logo"
            />
            <h2 className="correlated-modal-title" id="correlated-markets-modal-title">
              {market.correlationGroupName || 'Correlated Markets'}
            </h2>
            <button 
              className="correlated-modal-close-btn"
              onClick={onClose}
              aria-label="Close modal"
            >
              ×
            </button>
          </div>

          <p className="correlated-modal-description">
            Compare all options in this linked market group
          </p>

          {/* Main Content Area with Scrolling */}
          <div className="correlated-modal-content">
            {/* Radar and Options Side by Side */}
            <div className="correlated-content-row">
              {/* Radar Chart Section */}
              <div className="correlated-radar-section">
                <svg ref={svgRef} className="correlated-radar-chart"></svg>
              </div>

              {/* Options Section */}
              <div className="correlated-options-section">
                <h3 className="correlated-options-title">Options</h3>
                <div className="correlated-options-list">
                  {correlatedMarkets && correlatedMarkets.length > 0 && correlatedMarkets.map((option) => {
                    if (!option || !option.id) return null
                    
                    return (
                    <button
                      key={option.id}
                      className={`correlated-option-card ${selectedOption === option.id ? 'selected' : ''} ${!visibleMarkets[option.id] ? 'hidden-market' : ''}`}
                      onClick={() => handleMarketCardClick(option.id)}
                    >
                      <div className="correlated-option-header">
                        <div className="correlated-option-controls">
                          <button
                            className="correlated-visibility-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleMarketVisibility(option.id)
                            }}
                            aria-label={visibleMarkets[option.id] ? 'Hide from analysis' : 'Show in analysis'}
                            title={visibleMarkets[option.id] ? 'Hide from analysis' : 'Show in analysis'}
                          >
                            <span aria-hidden="true">{visibleMarkets[option.id] ? '👁️' : '👁️‍🗨️'}</span>
                          </button>
                        </div>
                        <span className="correlated-option-name">
                          {parseProposalTitle(option.proposalTitle || '')}
                        </span>
                        {selectedOption === option.id && (
                          <span className="correlated-selected-indicator">✓</span>
                        )}
                      </div>
                      
                      <div className="correlated-option-stats">
                        <div className="correlated-option-stat">
                          <span className="correlated-stat-label">Probability</span>
                          <span className="correlated-stat-value">{(parseFloat(option.passTokenPrice || 0) * 100).toFixed(1)}%</span>
                        </div>
                        <div className="correlated-option-stat">
                          <span className="correlated-stat-label">Volume</span>
                          <span className="correlated-stat-value">{formatPrice(option.totalLiquidity || 0, { compact: true })}</span>
                        </div>
                      </div>

                      {/* Histogram bar */}
                      <div className="correlated-price-histogram">
                        <div className="correlated-histogram-bar-container">
                          <div 
                            className="correlated-histogram-bar"
                            style={{ width: `${parseFloat(option.passTokenPrice || 0) * 100}%` }}
                          />
                        </div>
                        <div className="correlated-histogram-labels">
                          <span className="correlated-histogram-label">0%</span>
                          <span className="correlated-histogram-label">50%</span>
                          <span className="correlated-histogram-label">100%</span>
                        </div>
                      </div>
                    </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Timeline Section */}
            <div className="correlated-timeline-section">
              <div className="correlated-timeline-header">
                <h3 className="correlated-timeline-title">Market Sentiment Over Time</h3>
                <div className="correlated-time-horizon-controls">
                  {Object.entries(TIME_HORIZONS).map(([key, { label }]) => (
                    <button 
                      key={key}
                      className={`correlated-horizon-btn ${timeHorizon === key ? 'active' : ''}`}
                      onClick={() => setTimeHorizon(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="correlated-timeline-chart-container">
                <svg ref={timelineRef} className="correlated-timeline-chart"></svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CorrelatedMarketsModal
