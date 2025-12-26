import { useState, useEffect, useRef, useMemo, useId } from 'react'
import { usePrice } from '../../contexts/PriceContext'
import CurrencyToggle from '../ui/CurrencyToggle'
import ShareModal from '../ui/ShareModal'
import * as d3 from 'd3'
import './MarketHeroCard.css'

// Visualization constants
const PRICE_CHART_CONFIG = {
  DAYS: 30,
  HEIGHT: 200,
  MARGIN: { top: 20, right: 30, bottom: 30, left: 40 },
  STROKE_WIDTH: 2.5,
  INITIAL_OFFSET: 0.15,
  RANDOM_OFFSET: 0.1,
  DRIFT_FACTOR: 0.05,
  RANDOM_CHANGE: 0.05,
  MIN_PRICE: 0.1,
  MAX_PRICE: 0.9
}

const ACTIVITY_CONFIG = {
  HOURS: 24,
  BASE_ACTIVITY: 20,
  WEEKDAY_BUSINESS_HOURS_ACTIVITY: 70,
  EVENING_ACTIVITY: 40,
  BUSINESS_HOURS_START: 9,
  BUSINESS_HOURS_END: 17,
  EVENING_START: 6,
  EVENING_END: 22,
  RANDOM_VARIANCE: 30,
  CELL_PADDING: 1,
  LABEL_OFFSET: 35,
  HOUR_LABEL_INTERVAL: 3
}

const GAUGE_CONFIG = {
  SIZE: 200,
  STROKE_WIDTH: 20,
  ANIMATION_DURATION: 1000
}

// Mock data generators (outside component to prevent recreation)
const generatePriceHistory = (currentPrice) => {
  const data = []
  let price = currentPrice - PRICE_CHART_CONFIG.INITIAL_OFFSET + Math.random() * PRICE_CHART_CONFIG.RANDOM_OFFSET
  
  for (let i = 0; i < PRICE_CHART_CONFIG.DAYS; i++) {
    const date = new Date()
    date.setDate(date.getDate() - (PRICE_CHART_CONFIG.DAYS - i))
    
    // Random walk with drift toward current price
    const drift = (currentPrice - price) * PRICE_CHART_CONFIG.DRIFT_FACTOR
    const randomChange = (Math.random() - 0.5) * PRICE_CHART_CONFIG.RANDOM_CHANGE
    price = Math.max(PRICE_CHART_CONFIG.MIN_PRICE, Math.min(PRICE_CHART_CONFIG.MAX_PRICE, price + drift + randomChange))
    
    data.push({
      date,
      price: price * 100
    })
  }
  
  return data
}

const generateActivityData = () => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const data = []
  
  days.forEach((day, dayIndex) => {
    for (let hour = 0; hour < ACTIVITY_CONFIG.HOURS; hour++) {
      // Higher activity during business hours (9am-5pm) on weekdays
      let baseActivity = ACTIVITY_CONFIG.BASE_ACTIVITY
      if (dayIndex > 0 && dayIndex < 6 && hour >= ACTIVITY_CONFIG.BUSINESS_HOURS_START && hour <= ACTIVITY_CONFIG.BUSINESS_HOURS_END) {
        baseActivity = ACTIVITY_CONFIG.WEEKDAY_BUSINESS_HOURS_ACTIVITY
      } else if (hour >= ACTIVITY_CONFIG.EVENING_START && hour <= ACTIVITY_CONFIG.EVENING_END) {
        baseActivity = ACTIVITY_CONFIG.EVENING_ACTIVITY
      }
      
      const activity = baseActivity + Math.random() * ACTIVITY_CONFIG.RANDOM_VARIANCE
      data.push({
        day: dayIndex,
        hour,
        dayName: day,
        value: activity
      })
    }
  })
  
  return data
}

const generateHolderDistribution = () => {
  return [
    { range: '< 10', count: 145, percentage: 45, type: 'PASS' },
    { range: '10-100', count: 89, percentage: 28, type: 'PASS' },
    { range: '100-1K', count: 54, percentage: 17, type: 'PASS' },
    { range: '> 1K', count: 32, percentage: 10, type: 'PASS' },
    { range: '< 10', count: 112, percentage: 42, type: 'FAIL' },
    { range: '10-100', count: 76, percentage: 29, type: 'FAIL' },
    { range: '100-1K', count: 48, percentage: 18, type: 'FAIL' },
    { range: '> 1K', count: 29, percentage: 11, type: 'FAIL' }
  ]
}

function MarketHeroCard({ market, onTrade }) {
  const [tradeAmount, setTradeAmount] = useState('')
  const [tradeType, setTradeType] = useState('PASS')
  const [showShareModal, setShowShareModal] = useState(false)
  const { formatPrice } = usePrice()
  const priceChartRef = useRef(null)
  const activityHeatmapRef = useRef(null)
  const probabilityGaugeRef = useRef(null)
  
  // Generate unique IDs for SVG elements to avoid conflicts with multiple instances
  const gradientId = useId()
  const uniqueGradientId = `line-gradient-${gradientId}`

  
  if (!market) {
    return null
  }

  const calculateImpliedProbability = (passPrice) => {
    return (parseFloat(passPrice) * 100).toFixed(1)
  }

  const formatTimeRemaining = (endTime) => {
    const now = new Date()
    const end = new Date(endTime)
    const diff = end - now
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    
    if (days > 0) {
      return `${days} days, ${hours} hours`
    }
    return `${hours} hours`
  }

  const getCategoryIcon = (category) => {
    const icons = {
      'politics': '🏛️',
      'sports': '⚽',
      'finance': '💰',
      'tech': '💻',
      'pop-culture': '🎬',
      'crypto': '₿',
      'new': '✨',
      'daos': '🏢',
      'other': '📊'
    }
    return icons[category] || '📊'
  }

  const handleTradeSubmit = (e) => {
    e.preventDefault()
    if (onTrade) {
      onTrade({
        market,
        amount: tradeAmount,
        type: tradeType
      })
    }
  }

  const yesProb = calculateImpliedProbability(market.passTokenPrice)
  const noProb = calculateImpliedProbability(market.failTokenPrice)
  
  // Memoize mock data to prevent regeneration on every render
  const holderDistribution = useMemo(() => generateHolderDistribution(), [])
  const totalTrades = useMemo(() => Math.floor(Math.random() * 1000) + 100, [])

  // Render price history chart
  // Updates when passTokenPrice changes to regenerate chart with new probability data
  useEffect(() => {
    if (!priceChartRef.current) return

    const currentPrice = parseFloat(market.passTokenPrice)
    const data = generatePriceHistory(currentPrice)
    const container = priceChartRef.current
    const width = container.clientWidth
    const { HEIGHT, MARGIN, STROKE_WIDTH } = PRICE_CHART_CONFIG

    // Clear previous chart to prevent overlapping renders
    d3.select(container).selectAll('*').remove()

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', HEIGHT)
      .attr('role', 'img')
      .attr('aria-label', 'Price history chart showing market probability over time')

    const g = svg.append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    const chartWidth = width - MARGIN.left - MARGIN.right
    const chartHeight = HEIGHT - MARGIN.top - MARGIN.bottom

    // X axis: time scale mapping dates to horizontal position
    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.date))
      .range([0, chartWidth])

    // Y axis: linear scale for probability percentage (0-100%)
    const y = d3.scaleLinear()
      .domain([0, 100])
      .range([chartHeight, 0])

    // Add gradient fill for area under the line
    const gradient = svg.append('defs')
      .append('linearGradient')
      .attr('id', uniqueGradientId)
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%')

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#3b82f6')
      .attr('stop-opacity', 0.8)

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#3b82f6')
      .attr('stop-opacity', 0.1)

    // Create area generator for filled region under line
    const area = d3.area()
      .x(d => x(d.date))
      .y0(chartHeight)
      .y1(d => y(d.price))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(data)
      .attr('fill', `url(#${uniqueGradientId})`)
      .attr('d', area)

    // Create line generator for probability trend line
    const line = d3.line()
      .x(d => x(d.date))
      .y(d => y(d.price))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', STROKE_WIDTH)
      .attr('d', line)

    // Add X axis with date labels
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x).ticks(5))
      .attr('color', '#9ca3af')

    // Add Y axis with percentage labels
    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => d + '%'))
      .attr('color', '#9ca3af')

  }, [market.passTokenPrice, uniqueGradientId])

  // Render activity heatmap
  // Regenerates when market changes to show updated activity patterns
  useEffect(() => {
    if (!activityHeatmapRef.current) return

    const data = generateActivityData()
    const container = activityHeatmapRef.current
    const width = container.clientWidth
    const { CELL_PADDING, LABEL_OFFSET, HOUR_LABEL_INTERVAL } = ACTIVITY_CONFIG
    
    // Calculate cell size based on container width (24 hours + label space)
    const cellSize = Math.floor(width / 25)
    const height = cellSize * 8 // 7 days + label row

    // Clear previous chart
    d3.select(container).selectAll('*').remove()

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('role', 'img')
      .attr('aria-label', 'Activity heatmap showing market trading activity by day and hour')

    // Color scale: higher activity values map to darker blue
    const colorScale = d3.scaleSequential(d3.interpolateBlues)
      .domain([0, 100])

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    // Add day labels on left side
    svg.selectAll('.day-label')
      .data(days)
      .enter()
      .append('text')
      .attr('x', 5)
      .attr('y', (d, i) => (i + 1) * cellSize + cellSize / 2 + 4)
      .attr('text-anchor', 'start')
      .attr('font-size', '12px')
      .attr('fill', '#9ca3af')
      .text(d => d)

    // Add heatmap cells with activity data
    svg.selectAll('.activity-cell')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'activity-cell')
      .attr('x', d => (d.hour + 1) * cellSize + LABEL_OFFSET)
      .attr('y', d => d.day * cellSize + cellSize)
      .attr('width', cellSize - CELL_PADDING)
      .attr('height', cellSize - CELL_PADDING)
      .attr('rx', 2)
      .attr('fill', d => colorScale(d.value))
      .attr('opacity', 0.8)
      .append('title')
      .text(d => `${d.dayName} ${d.hour}:00 - Activity: ${Math.round(d.value)}`)

    // Add hour labels at top (every 3 hours to avoid crowding)
    for (let i = 0; i < ACTIVITY_CONFIG.HOURS; i += HOUR_LABEL_INTERVAL) {
      svg.append('text')
        .attr('x', (i + 1) * cellSize + LABEL_OFFSET + cellSize / 2)
        .attr('y', 12)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .attr('fill', '#9ca3af')
        .text(i)
    }

  }, [market])

  // Render probability gauge
  // Updates when passTokenPrice changes to show current market sentiment
  useEffect(() => {
    if (!probabilityGaugeRef.current) return

    const container = probabilityGaugeRef.current
    const { SIZE, STROKE_WIDTH, ANIMATION_DURATION } = GAUGE_CONFIG
    const radius = (SIZE - STROKE_WIDTH) / 2
    const circumference = 2 * Math.PI * radius
    const probability = parseFloat(market.passTokenPrice)

    // Clear previous gauge
    d3.select(container).selectAll('*').remove()

    const svg = d3.select(container)
      .append('svg')
      .attr('width', SIZE)
      .attr('height', SIZE)
      .attr('role', 'img')
      .attr('aria-label', `Market probability gauge showing ${(probability * 100).toFixed(1)}% chance`)

    // Center group for circular gauge
    const g = svg.append('g')
      .attr('transform', `translate(${SIZE / 2},${SIZE / 2})`)

    // Background circle (full ring)
    g.append('circle')
      .attr('r', radius)
      .attr('fill', 'none')
      .attr('stroke', '#1f2937')
      .attr('stroke-width', STROKE_WIDTH)

    // Probability circle (animated progress ring)
    const progressCircle = g.append('circle')
      .attr('r', radius)
      .attr('fill', 'none')
      .attr('stroke', probability >= 0.5 ? '#22c55e' : '#ef4444')
      .attr('stroke-width', STROKE_WIDTH)
      .attr('stroke-linecap', 'round')
      .attr('transform', 'rotate(-90)') // Start from top
      .attr('stroke-dasharray', circumference)
      .attr('stroke-dashoffset', circumference)

    // Check for reduced motion preference for accessibility
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const animationDuration = prefersReducedMotion ? 0 : ANIMATION_DURATION

    // Animate progress ring to show probability
    progressCircle.transition()
      .duration(animationDuration)
      .attr('stroke-dashoffset', circumference * (1 - probability))

    // Center percentage text
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.2em')
      .attr('font-size', '48px')
      .attr('font-weight', 'bold')
      .attr('fill', probability >= 0.5 ? '#22c55e' : '#ef4444')
      .text(`${(probability * 100).toFixed(0)}%`)

    // Label below percentage
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.5em')
      .attr('font-size', '14px')
      .attr('fill', '#9ca3af')
      .text('YES Probability')

  }, [market.passTokenPrice])

  return (
    <div className="market-hero-card">
      <div className="hero-header">
        <div className="hero-category">
          <span className="hero-category-icon" aria-hidden="true">
            {getCategoryIcon(market.category)}
          </span>
          <span className="hero-category-name">
            {market.category.replace('-', ' ').toUpperCase()}
          </span>
        </div>
        <div className="hero-actions">
          <CurrencyToggle />
          <button 
            className="hero-action-btn share" 
            aria-label="Share market"
            onClick={() => setShowShareModal(true)}
          >
            <span aria-hidden="true">🔗</span> Share
          </button>
        </div>
      </div>

      <h1 className="hero-title">{market.proposalTitle}</h1>

      {market.description && (
        <p className="hero-description">{market.description}</p>
      )}

      {/* MOVED TO TOP: Trade Panel */}
      <div className="hero-trade-panel">
        <h3>Trade on this market</h3>
        <form onSubmit={handleTradeSubmit}>
          <div className="trade-type-selector">
            <button
              type="button"
              className={`trade-type-btn buy ${tradeType === 'PASS' ? 'active' : ''}`}
              onClick={() => setTradeType('PASS')}
              aria-pressed={tradeType === 'PASS'}
            >
              <span className="btn-icon">↑</span>
              <div className="btn-content">
                <span className="btn-label">Buy YES</span>
                <span className="btn-price">${(parseFloat(market.passTokenPrice) * 1).toFixed(2)}</span>
              </div>
            </button>
            <button
              type="button"
              className={`trade-type-btn sell ${tradeType === 'FAIL' ? 'active' : ''}`}
              onClick={() => setTradeType('FAIL')}
              aria-pressed={tradeType === 'FAIL'}
            >
              <span className="btn-icon">↓</span>
              <div className="btn-content">
                <span className="btn-label">Buy NO</span>
                <span className="btn-price">${(parseFloat(market.failTokenPrice) * 1).toFixed(2)}</span>
              </div>
            </button>
          </div>

          <div className="trade-input-group">
            <label htmlFor="hero-trade-amount">Amount (USD)</label>
            <input
              type="number"
              id="hero-trade-amount"
              value={tradeAmount}
              onChange={(e) => setTradeAmount(e.target.value)}
              placeholder="Enter amount"
              step="0.01"
              min="0"
              required
            />
            {tradeAmount && (
              <div className="potential-win-display">
                <span className="win-label">Potential win:</span>
                <span className="win-amount">
                  ${(parseFloat(tradeAmount) * (1 / (tradeType === 'PASS' ? parseFloat(market.passTokenPrice) : parseFloat(market.failTokenPrice)))).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          <button type="submit" className="trade-submit-btn">
            Execute Trade
          </button>

          <div className="transparency-notice">
            <span aria-hidden="true">👁️</span>
            <span>Transparent market - all trades are publicly visible on the blockchain</span>
          </div>
        </form>
      </div>

      {/* Probability Gauge and Stats Side by Side */}
      <div className="hero-visual-row">
        <div className="probability-gauge-container">
          <h3>Spot Probability</h3>
          <div ref={probabilityGaugeRef} className="probability-gauge"></div>
        </div>

        <div className="hero-stats-grid">
          <div className="stat-card">
            <span className="stat-label">Total Volume</span>
            <span className="stat-number">{formatPrice(market.totalLiquidity, { compact: true })}</span>
          </div>

          <div className="stat-card">
            <span className="stat-label">24h Change</span>
            <span className="stat-number change-positive">+2.3%</span>
          </div>

          <div className="stat-card">
            <span className="stat-label">Total Trades</span>
            <span className="stat-number">{totalTrades}</span>
          </div>

          <div className="stat-card">
            <span className="stat-label">Market closes in</span>
            <span className="stat-number">{formatTimeRemaining(market.tradingEndTime)}</span>
          </div>
        </div>
      </div>

      {/* Price History Chart */}
      <div className="chart-section">
        <h3>Price History (30 Days)</h3>
        <div ref={priceChartRef} className="price-history-chart"></div>
      </div>

      {/* Activity Heatmap */}
      <div className="chart-section">
        <h3>Market Activity Heatmap</h3>
        <p className="chart-description">Trading activity by day and hour (darker = more active)</p>
        <div ref={activityHeatmapRef} className="activity-heatmap"></div>
      </div>

      {/* Holder Distribution */}
      <div className="chart-section">
        <h3>Holder Distribution</h3>
        <div className="holder-distribution">
          <div className="distribution-column">
            <h4 className="distribution-title yes-title">YES Token Holders</h4>
            {holderDistribution.filter(h => h.type === 'PASS').map((holder, idx) => (
              <div key={idx} className="holder-bar-container">
                <div className="holder-label">
                  <span className="holder-range">{holder.range}</span>
                  <span className="holder-count">{holder.count} holders</span>
                </div>
                <div className="holder-bar-bg">
                  <div 
                    className="holder-bar yes-bar" 
                    style={{ width: `${holder.percentage}%` }}
                  ></div>
                </div>
                <span className="holder-percentage">{holder.percentage}%</span>
              </div>
            ))}
          </div>

          <div className="distribution-column">
            <h4 className="distribution-title no-title">NO Token Holders</h4>
            {holderDistribution.filter(h => h.type === 'FAIL').map((holder, idx) => (
              <div key={idx} className="holder-bar-container">
                <div className="holder-label">
                  <span className="holder-range">{holder.range}</span>
                  <span className="holder-count">{holder.count} holders</span>
                </div>
                <div className="holder-bar-bg">
                  <div 
                    className="holder-bar no-bar" 
                    style={{ width: `${holder.percentage}%` }}
                  ></div>
                </div>
                <span className="holder-percentage">{holder.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ShareModal 
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        market={market}
      />
    </div>
  )
}

export default MarketHeroCard
