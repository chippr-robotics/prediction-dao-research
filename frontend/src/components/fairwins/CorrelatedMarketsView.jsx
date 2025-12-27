import { useState, useMemo, useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { usePrice } from '../../contexts/PriceContext'
import './CorrelatedMarketsView.css'

function CorrelatedMarketsView({ market, correlatedMarkets, onTrade, onOpenMarket }) {
  const [selectedOption, setSelectedOption] = useState(market.id)
  const [visibleMarkets, setVisibleMarkets] = useState(
    correlatedMarkets.reduce((acc, m) => ({ ...acc, [m.id]: true }), {})
  )
  const [timeHorizon, setTimeHorizon] = useState('7d') // 7d, 30d, 90d, all
  const [lastTap, setLastTap] = useState({ marketId: null, timestamp: 0 })
  const { formatPrice } = usePrice()
  const svgRef = useRef(null)
  const timelineRef = useRef(null)

  const selectedMarket = useMemo(() => {
    return correlatedMarkets.find(m => m.id === selectedOption) || market
  }, [selectedOption, correlatedMarkets, market])

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

  // Prepare radar chart data (only visible markets)
  const radarData = useMemo(() => {
    return correlatedMarkets
      .filter(m => visibleMarkets[m.id])
      .map(m => ({
        id: m.id,
        label: m.proposalTitle.split(':')[1]?.trim() || m.proposalTitle,
        probability: parseFloat(m.passTokenPrice) * 100,
        totalLiquidity: parseFloat(m.totalLiquidity)
      }))
  }, [correlatedMarkets, visibleMarkets])

  // Generate mock historical data for timeline
  const generateTimelineData = (market, horizon) => {
    const now = Date.now()
    const dataPoints = horizon === '7d' ? 7 : horizon === '30d' ? 30 : horizon === '90d' ? 90 : 365
    const dayMs = 24 * 60 * 60 * 1000
    const baseProb = parseFloat(market.passTokenPrice) * 100
    
    return Array.from({ length: dataPoints }, (_, i) => ({
      date: new Date(now - (dataPoints - i - 1) * dayMs),
      probability: baseProb + (Math.random() - 0.5) * 15 // Mock variance
    }))
  }

  // Create radar chart using D3.js
  useEffect(() => {
    if (!svgRef.current || radarData.length === 0) return

    const width = 350
    const height = 350
    const centerX = width / 2
    const centerY = height / 2
    const maxRadius = 120 // Smaller exterior radius
    const levels = 5 // Number of concentric circles
    const angleSlice = (Math.PI * 2) / radarData.length

    // Calculate dynamic scale based on market probabilities
    // Use average as baseline, with padding for visual distinction
    const probabilities = radarData.map(d => d.probability)
    const avgProb = probabilities.reduce((a, b) => a + b, 0) / probabilities.length
    const maxProb = Math.max(...probabilities)
    const minProb = Math.min(...probabilities)
    const range = maxProb - minProb
    
    // Dynamic scale: if markets are close (range < 20%), zoom in for better comparison
    // Otherwise use full 0-100 scale
    let scaleMin = 0
    let scaleMax = 100
    
    if (range < 20 && range > 0) {
      // Close match: center scale around average with padding
      const padding = Math.max(range * 0.5, 5) // At least 5% padding
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

    // Create main group
    const g = svg.append('g')
      .attr('transform', `translate(${centerX},${centerY})`)

    // Draw concentric circles (grid) with dynamic scale labels
    const gridLevels = d3.range(1, levels + 1).reverse()
    gridLevels.forEach((level) => {
      g.append('circle')
        .attr('r', (maxRadius / levels) * level)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(54, 179, 126, 0.15)')
        .attr('stroke-width', 1)
      
      // Add percentage labels with dynamic scale
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

    // Create enhanced data with artificial anchor points between options for petal effect
    // This makes the petals arch outward toward each option and curve back inward between them
    const enhancedData = []
    const innerCircleRadius = 0.15 // 15% inner circle where petals meet
    
    radarData.forEach((d, i) => {
      // Add the main data point (arches outward to this option)
      // Prevent division by zero when all probabilities are identical
      const radius = scaleRange > 0 ? (d.probability - scaleMin) / scaleRange : 0.5
      
      enhancedData.push({
        angle: angleSlice * i,
        radius: radius,
        name: d.name
      })
      
      // Add anchor point between this option and the next (curves back to inner circle)
      enhancedData.push({
        angle: angleSlice * i + angleSlice / 2,
        radius: innerCircleRadius, // Pull back to inner circle between options
        name: null // Anchor point, not a real market
      })
    })
    
    // Create data polygon with smooth curves for flower petal effect
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

    // Draw data points (only for actual markets, not anchor points)
    radarData.forEach((d, i) => {
      const angle = angleSlice * i - Math.PI / 2
      // Prevent division by zero when all probabilities are identical
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

    // Draw labels around the perimeter with high z-order
    const labelsGroup = g.append('g')
      .attr('class', 'radar-labels-group')
      .style('pointer-events', 'none') // Ensure labels don't interfere with interactions
    
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
        .style('paint-order', 'stroke fill') // Ensure text renders on top
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

    // Auto-scale Y-axis based on actual probability ranges for better visualization
    const allProbabilities = allTimelines.flatMap(t => t.data.map(d => d.probability))
    const minProb = Math.min(...allProbabilities)
    const maxProb = Math.max(...allProbabilities)
    const probRange = maxProb - minProb
    
    // Add padding for better visualization (10% of range on each side)
    // Use minimum of 5 percentage points to ensure visibility even for very close probabilities
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

  return (
    <div className="correlated-markets-view">
      <div className="correlation-header">
        <div className="correlation-group-info">
          <h2 className="correlation-group-title">{market.correlationGroupName}</h2>
        </div>
        <p className="correlation-description">
          Compare all options in this linked market group
        </p>
      </div>

      {/* Single card containing both radar and options */}
      <div className="correlation-card">
        <div className="correlation-content">
          {/* Radar Chart - Smaller size */}
          <div className="radar-section">
            <svg ref={svgRef} className="radar-chart"></svg>
          </div>

          {/* Options Cards */}
          <div className="options-section">
            <h3 className="options-title">Options</h3>
            <div className="options-list">
              {correlatedMarkets.map((option) => (
                <button
                  key={option.id}
                  className={`option-card ${selectedOption === option.id ? 'selected' : ''} ${!visibleMarkets[option.id] ? 'hidden-market' : ''}`}
                  onClick={() => handleMarketCardClick(option.id)}
                >
                  <div className="option-header">
                    <div className="option-controls">
                      <button
                        className="visibility-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleMarketVisibility(option.id)
                        }}
                        title={visibleMarkets[option.id] ? 'Hide from analysis' : 'Show in analysis'}
                      >
                        {visibleMarkets[option.id] ? '👁️' : '👁️‍🗨️'}
                      </button>
                    </div>
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
          </div>
        </div>
      </div>

      {/* Timeline View */}
      <div className="timeline-section">
        <div className="timeline-header">
          <h3 className="timeline-title">Market Sentiment Over Time</h3>
          <div className="time-horizon-controls">
            <button 
              className={`horizon-btn ${timeHorizon === '7d' ? 'active' : ''}`}
              onClick={() => setTimeHorizon('7d')}
            >
              7 Days
            </button>
            <button 
              className={`horizon-btn ${timeHorizon === '30d' ? 'active' : ''}`}
              onClick={() => setTimeHorizon('30d')}
            >
              30 Days
            </button>
            <button 
              className={`horizon-btn ${timeHorizon === '90d' ? 'active' : ''}`}
              onClick={() => setTimeHorizon('90d')}
            >
              90 Days
            </button>
            <button 
              className={`horizon-btn ${timeHorizon === 'all' ? 'active' : ''}`}
              onClick={() => setTimeHorizon('all')}
            >
              All Time
            </button>
          </div>
        </div>
        <div className="timeline-chart-container">
          <svg ref={timelineRef} className="timeline-chart"></svg>
        </div>
      </div>
    </div>
  )
}

export default CorrelatedMarketsView
