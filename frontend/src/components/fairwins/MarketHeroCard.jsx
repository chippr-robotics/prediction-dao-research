import { useState, useEffect, useRef } from 'react'
import { usePrice } from '../../contexts/PriceContext'
import CurrencyToggle from '../ui/CurrencyToggle'
import ShareModal from '../ui/ShareModal'
import * as d3 from 'd3'
import './MarketHeroCard.css'

function MarketHeroCard({ market, onTrade }) {
  const [tradeAmount, setTradeAmount] = useState('')
  const [tradeType, setTradeType] = useState('PASS')
  const [showShareModal, setShowShareModal] = useState(false)
  const { formatPrice } = usePrice()
  const priceChartRef = useRef(null)
  const activityHeatmapRef = useRef(null)
  const probabilityGaugeRef = useRef(null)

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

  // Generate mock price history data
  const generatePriceHistory = () => {
    const days = 30
    const data = []
    const currentPrice = parseFloat(market.passTokenPrice)
    let price = currentPrice - 0.15 + Math.random() * 0.1
    
    for (let i = 0; i < days; i++) {
      const date = new Date()
      date.setDate(date.getDate() - (days - i))
      
      // Random walk with drift toward current price
      const drift = (currentPrice - price) * 0.05
      const randomChange = (Math.random() - 0.5) * 0.05
      price = Math.max(0.1, Math.min(0.9, price + drift + randomChange))
      
      data.push({
        date,
        price: price * 100
      })
    }
    
    return data
  }

  // Generate mock activity heatmap data
  const generateActivityData = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const hours = 24
    const data = []
    
    days.forEach((day, dayIndex) => {
      for (let hour = 0; hour < hours; hour++) {
        // Higher activity during business hours (9am-5pm) on weekdays
        let baseActivity = 20
        if (dayIndex > 0 && dayIndex < 6 && hour >= 9 && hour <= 17) {
          baseActivity = 70
        } else if (hour >= 6 && hour <= 22) {
          baseActivity = 40
        }
        
        const activity = baseActivity + Math.random() * 30
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

  // Generate mock holder distribution data
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

  // Render price history chart
  useEffect(() => {
    if (!priceChartRef.current) return

    const data = generatePriceHistory()
    const container = priceChartRef.current
    const width = container.clientWidth
    const height = 200
    const margin = { top: 20, right: 30, bottom: 30, left: 40 }

    // Clear previous chart
    d3.select(container).selectAll('*').remove()

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('role', 'img')
      .attr('aria-label', 'Price history chart showing market probability over time')

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const chartWidth = width - margin.left - margin.right
    const chartHeight = height - margin.top - margin.bottom

    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.date))
      .range([0, chartWidth])

    const y = d3.scaleLinear()
      .domain([0, 100])
      .range([chartHeight, 0])

    // Add gradient
    const gradient = svg.append('defs')
      .append('linearGradient')
      .attr('id', 'line-gradient')
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

    // Add area under line
    const area = d3.area()
      .x(d => x(d.date))
      .y0(chartHeight)
      .y1(d => y(d.price))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(data)
      .attr('fill', 'url(#line-gradient)')
      .attr('d', area)

    // Add line
    const line = d3.line()
      .x(d => x(d.date))
      .y(d => y(d.price))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2.5)
      .attr('d', line)

    // Add axes
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x).ticks(5))
      .attr('color', '#9ca3af')

    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => d + '%'))
      .attr('color', '#9ca3af')

  }, [market])

  // Render activity heatmap
  useEffect(() => {
    if (!activityHeatmapRef.current) return

    const data = generateActivityData()
    const container = activityHeatmapRef.current
    const width = container.clientWidth
    const cellSize = Math.floor(width / 25) // 24 hours + label space
    const height = cellSize * 8 // 7 days + label

    // Clear previous chart
    d3.select(container).selectAll('*').remove()

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('role', 'img')
      .attr('aria-label', 'Activity heatmap showing market trading activity by day and hour')

    const colorScale = d3.scaleSequential(d3.interpolateBlues)
      .domain([0, 100])

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    // Add day labels
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

    // Add cells
    svg.selectAll('.activity-cell')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'activity-cell')
      .attr('x', d => (d.hour + 1) * cellSize + 35)
      .attr('y', d => d.day * cellSize + cellSize)
      .attr('width', cellSize - 1)
      .attr('height', cellSize - 1)
      .attr('rx', 2)
      .attr('fill', d => colorScale(d.value))
      .attr('opacity', 0.8)
      .append('title')
      .text(d => `${d.dayName} ${d.hour}:00 - Activity: ${Math.round(d.value)}`)

    // Add hour labels (every 3 hours)
    for (let i = 0; i < 24; i += 3) {
      svg.append('text')
        .attr('x', (i + 1) * cellSize + 35 + cellSize / 2)
        .attr('y', 12)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .attr('fill', '#9ca3af')
        .text(i)
    }

  }, [market])

  // Render probability gauge
  useEffect(() => {
    if (!probabilityGaugeRef.current) return

    const container = probabilityGaugeRef.current
    const size = 200
    const strokeWidth = 20
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const probability = parseFloat(market.passTokenPrice)

    // Clear previous gauge
    d3.select(container).selectAll('*').remove()

    const svg = d3.select(container)
      .append('svg')
      .attr('width', size)
      .attr('height', size)
      .attr('role', 'img')
      .attr('aria-label', `Market probability gauge showing ${(probability * 100).toFixed(1)}% chance`)

    const g = svg.append('g')
      .attr('transform', `translate(${size / 2},${size / 2})`)

    // Background circle
    g.append('circle')
      .attr('r', radius)
      .attr('fill', 'none')
      .attr('stroke', '#1f2937')
      .attr('stroke-width', strokeWidth)

    // Probability circle
    const progressCircle = g.append('circle')
      .attr('r', radius)
      .attr('fill', 'none')
      .attr('stroke', probability >= 0.5 ? '#22c55e' : '#ef4444')
      .attr('stroke-width', strokeWidth)
      .attr('stroke-linecap', 'round')
      .attr('transform', 'rotate(-90)')
      .attr('stroke-dasharray', circumference)
      .attr('stroke-dashoffset', circumference)

    // Animate
    progressCircle.transition()
      .duration(1000)
      .attr('stroke-dashoffset', circumference * (1 - probability))

    // Center text
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.2em')
      .attr('font-size', '48px')
      .attr('font-weight', 'bold')
      .attr('fill', probability >= 0.5 ? '#22c55e' : '#ef4444')
      .text(`${(probability * 100).toFixed(0)}%`)

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.5em')
      .attr('font-size', '14px')
      .attr('fill', '#9ca3af')
      .text('YES Probability')

  }, [market])

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
            <span className="stat-number">{Math.floor(Math.random() * 1000) + 100}</span>
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
        <p className="chart-description">Trading activity by day and hour (lighter = more active)</p>
        <div ref={activityHeatmapRef} className="activity-heatmap"></div>
      </div>

      {/* Holder Distribution */}
      <div className="chart-section">
        <h3>Holder Distribution</h3>
        <div className="holder-distribution">
          <div className="distribution-column">
            <h4 className="distribution-title yes-title">YES Token Holders</h4>
            {generateHolderDistribution().filter(h => h.type === 'PASS').map((holder, idx) => (
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
            {generateHolderDistribution().filter(h => h.type === 'FAIL').map((holder, idx) => (
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
