import { useState, useMemo } from 'react'
import { findSubcategoryById } from '../../config/subcategories'
import './ModernMarketCard.css'

// Category background images (using placeholders that represent each category)
const getCategoryThumbnail = (category) => {
  const thumbnails = {
    politics: 'linear-gradient(135deg, rgba(183, 28, 28, 0.6) 0%, rgba(136, 14, 79, 0.4) 100%)',
    sports: 'linear-gradient(135deg, rgba(27, 94, 32, 0.6) 0%, rgba(0, 77, 64, 0.4) 100%)',
    crypto: 'linear-gradient(135deg, rgba(245, 127, 23, 0.6) 0%, rgba(230, 81, 0, 0.4) 100%)',
    finance: 'linear-gradient(135deg, rgba(13, 71, 161, 0.6) 0%, rgba(21, 101, 192, 0.4) 100%)',
    tech: 'linear-gradient(135deg, rgba(74, 20, 140, 0.6) 0%, rgba(106, 27, 154, 0.4) 100%)',
    'pop-culture': 'linear-gradient(135deg, rgba(136, 14, 79, 0.6) 0%, rgba(194, 24, 91, 0.4) 100%)'
  }
  return thumbnails[category] || thumbnails.finance
}

// Get subcategory display name
const getSubcategoryName = (subcategoryId) => {
  const subcategory = findSubcategoryById(subcategoryId)
  return subcategory ? subcategory.name : subcategoryId
}

// Format number for display
const formatNumber = (num) => {
  const n = parseFloat(num)
  if (Number.isNaN(n) || n === null) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return parseFloat(n.toFixed(0)).toString()
}

// Sparkline generation constants
const SPARKLINE_DATA_POINTS = 12
const SPARKLINE_MIN_PRICE = 0.05
const SPARKLINE_MAX_PRICE = 0.95
const SPARKLINE_TREND_FACTOR = 0.1
const SPARKLINE_SEED_MULTIPLIER = 7
const SPARKLINE_VARIATION_RANGE = 0.15
const SPARKLINE_DEFAULT_PRICE = 0.5

// Generate sparkline data points
const generateSparklineData = (market) => {
  // Use market ID as seed for consistent pseudo-random data
  const seed = market.id || 0
  const stableRandom = (s) => {
    const x = Math.sin(s) * 10000
    return x - Math.floor(x)
  }
  
  const basePrice = parseFloat(market.passTokenPrice) || SPARKLINE_DEFAULT_PRICE
  const points = []
  
  for (let i = 0; i < SPARKLINE_DATA_POINTS; i++) {
    const variation = (stableRandom(seed + i * SPARKLINE_SEED_MULTIPLIER) - 0.5) * SPARKLINE_VARIATION_RANGE
    const trendAdjustment = SPARKLINE_TREND_FACTOR * (SPARKLINE_DATA_POINTS - i) / SPARKLINE_DATA_POINTS
    const price = Math.max(SPARKLINE_MIN_PRICE, Math.min(SPARKLINE_MAX_PRICE, basePrice + variation - trendAdjustment))
    points.push(price)
  }
  
  // Last point is current price
  points.push(basePrice)
  return points
}

// Calculate trend from sparkline data
const calculateTrend = (data) => {
  if (!data || data.length < 2) return { direction: 'up', change: 0 }
  const first = data[0]
  const last = data[data.length - 1]
  const change = ((last - first) / first * 100).toFixed(0)
  return {
    direction: last >= first ? 'up' : 'down',
    change: Math.abs(change)
  }
}

// Format time remaining
const formatTimeRemaining = (endTime) => {
  const now = new Date()
  const end = new Date(endTime)
  const diff = end - now
  
  if (diff <= 0) return 'Ended'
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  
  if (days > 30) {
    const months = Math.floor(days / 30)
    return `${months}mo`
  }
  if (days > 0) return `${days}d`
  return `${hours}h`
}

function ModernMarketCard({ 
  market, 
  onClick, 
  onTrade, 
  onSimulate,
  isActive = false,
  isFirstRow = false 
}) {
  const [isExpanded, setIsExpanded] = useState(isFirstRow)

  const yesProb = useMemo(() => (parseFloat(market.passTokenPrice) * 100).toFixed(0), [market.passTokenPrice])
  const noProb = useMemo(() => (100 - parseFloat(yesProb)).toFixed(0), [yesProb])
  
  const sparklineData = useMemo(() => generateSparklineData(market), [market])
  const trend = useMemo(() => calculateTrend(sparklineData), [sparklineData])
  
  // Get subcategory display name
  const subcategoryName = useMemo(() => 
    market.subcategory ? getSubcategoryName(market.subcategory) : null, 
    [market.subcategory]
  )

  // Create SVG path for sparkline
  const sparklinePath = useMemo(() => {
    const width = 80
    const height = 28
    const padding = 2
    
    const min = Math.min(...sparklineData)
    const max = Math.max(...sparklineData)
    const range = max - min || 0.1
    
    const points = sparklineData.map((val, i) => {
      const x = padding + (i / (sparklineData.length - 1)) * (width - 2 * padding)
      const y = padding + (1 - (val - min) / range) * (height - 2 * padding)
      return `${x},${y}`
    })
    
    return `M ${points.join(' L ')}`
  }, [sparklineData])

  // Create area path for sparkline
  const sparklineArea = useMemo(() => {
    const width = 80
    const height = 28
    const padding = 2
    
    const min = Math.min(...sparklineData)
    const max = Math.max(...sparklineData)
    const range = max - min || 0.1
    
    const points = sparklineData.map((val, i) => {
      const x = padding + (i / (sparklineData.length - 1)) * (width - 2 * padding)
      const y = padding + (1 - (val - min) / range) * (height - 2 * padding)
      return `${x},${y}`
    })
    
    const firstX = padding
    const lastX = padding + (width - 2 * padding)
    
    return `M ${firstX},${height - padding} L ${points.join(' L ')} L ${lastX},${height - padding} Z`
  }, [sparklineData])

  // Calculate gauge arc for full circle
  const gaugeArc = useMemo(() => {
    const percent = parseFloat(yesProb)
    const circumference = Math.PI * 2 * 40 // Full circle with radius 40
    const offset = (percent / 100) * circumference
    return { dashArray: `${offset} ${circumference}`, circumference }
  }, [yesProb])

  const handleClick = () => {
    // Toggle expansion for non-first-row cards
    if (!isFirstRow) {
      setIsExpanded(!isExpanded)
    }
    if (onClick) {
      onClick(market)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  const handleYesClick = (e) => {
    e.stopPropagation()
    if (onTrade) {
      onTrade(market, 'yes')
    } else if (onClick) {
      onClick(market)
    }
  }

  const handleNoClick = (e) => {
    e.stopPropagation()
    if (onTrade) {
      onTrade(market, 'no')
    } else if (onClick) {
      onClick(market)
    }
  }

  const handleSimulateClick = (e) => {
    e.stopPropagation()
    if (onSimulate) {
      onSimulate(market)
    }
  }

  const handleMouseEnter = () => {
    if (!isFirstRow) setIsExpanded(true)
  }
  const handleMouseLeave = () => {
    if (!isFirstRow) setIsExpanded(false)
  }

  return (
    <div 
      className={`modern-market-card ${isActive ? 'active' : ''} ${isExpanded || isFirstRow ? 'expanded' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="button"
      tabIndex={0}
      aria-label={`View market: ${market.proposalTitle}`}
      aria-pressed={isActive}
    >
      {/* Correlation group indicator */}
      {market.correlationGroupId && (
        <div className="correlation-indicator" title={market.correlationGroupName} />
      )}

      {/* Background thumbnail */}
      <div 
        className="card-thumbnail"
        style={{ background: getCategoryThumbnail(market.category) }}
      />

      {/* Header with badges */}
      <div className="card-header">
        <div className="card-badges">
          {/* Show subcategory instead of category since we pre-sort by category */}
          {subcategoryName && (
            <span className={`category-pill ${market.category}`}>
              {subcategoryName}
            </span>
          )}
          {/* Show correlation group name instead of "Group" */}
          {market.correlationGroupName && (
            <span className="correlation-group-pill" title={market.correlationGroupName}>
              {market.correlationGroupName}
            </span>
          )}
        </div>
        <span className="resolution-date">
          {formatTimeRemaining(market.tradingEndTime)}
        </span>
      </div>

      {/* Card title */}
      <h3 className="card-title">{market.proposalTitle}</h3>

      {/* Top section: Ring gauge and trend aligned horizontally */}
      <div className="gauge-trend-section">
        {/* Full Ring Probability Gauge */}
        <div className="probability-ring">
          <svg viewBox="0 0 100 100">
            <defs>
              <linearGradient id={`ringGradient-${market.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#36B37E" />
                <stop offset="60%" stopColor="#f1c40f" />
                <stop offset="100%" stopColor="#e17055" />
              </linearGradient>
            </defs>
            {/* Background ring */}
            <circle
              className="ring-bg"
              cx="50"
              cy="50"
              r="40"
              fill="none"
            />
            {/* Filled ring based on YES probability */}
            <circle
              className="ring-fill"
              cx="50"
              cy="50"
              r="40"
              fill="none"
              style={{
                stroke: `url(#ringGradient-${market.id})`,
                strokeDasharray: gaugeArc.dashArray,
                strokeDashoffset: gaugeArc.circumference * 0.25, // Start from top
                transform: 'rotate(-90deg)',
                transformOrigin: 'center'
              }}
            />
          </svg>
          
          {/* Center content */}
          <div className="ring-center">
            <span className="ring-percentage">{yesProb}%</span>
            <span className="ring-label">Yes</span>
          </div>
        </div>

        {/* Sparkline and trend */}
        <div className="trend-section">
          <div className="trend-label">Price History</div>
          <div className="sparkline-container-v2">
            <svg viewBox="0 0 100 40" preserveAspectRatio="none">
              <path
                className="sparkline-area"
                d={sparklineArea.replace(/80/g, '100').replace(/28/g, '40')}
                fill={trend.direction === 'up' ? '#36B37E' : '#e17055'}
              />
              <path
                className="sparkline-line"
                d={sparklinePath.replace(/80/g, '100').replace(/28/g, '40')}
                stroke={trend.direction === 'up' ? '#36B37E' : '#e17055'}
              />
            </svg>
          </div>
          <div className={`trend-indicator-v2 ${trend.direction}`}>
            <span className="trend-arrow">{trend.direction === 'up' ? '↗' : '↘'}</span>
            <span className="trend-change">{trend.direction === 'up' ? '+' : '-'}{trend.change}% today</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="stats-row">
        <div className="stat-item">
          <span className="stat-icon">📊</span>
          <span className="stat-label">Volume</span>
          <span className="stat-value">${formatNumber(market.volume24h || market.totalLiquidity * 0.08)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-icon">💧</span>
          <span className="stat-label">Liquidity</span>
          <span className="stat-value">${formatNumber(market.totalLiquidity)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-icon">👥</span>
          <span className="stat-label">Traders</span>
          <span className="stat-value">{market.uniqueTraders || formatNumber(market.tradesCount || 45)}</span>
        </div>
      </div>

      {/* Tags row - use existing market tags */}
      {market.tags && market.tags.length > 0 && (
        <div className="tags-row">
          {market.tags.slice(0, 4).map((tag, index) => (
            <span key={index} className="market-tag">{tag}</span>
          ))}
        </div>
      )}

      {/* Binary action buttons: Yes/No */}
      <div className="action-buttons">
        <button 
          className="action-btn yes-btn"
          onClick={handleYesClick}
          aria-label={`Buy Yes on ${market.proposalTitle}`}
        >
          <span className="btn-label">Yes</span>
          <span className="btn-price">{yesProb}¢</span>
        </button>
        <button 
          className="action-btn no-btn"
          onClick={handleNoClick}
          aria-label={`Buy No on ${market.proposalTitle}`}
        >
          <span className="btn-label">No</span>
          <span className="btn-price">{noProb}¢</span>
        </button>
      </div>

      {/* Expanded content - visible for first row, on hover/click for others */}
      <div className="card-expanded-content">
        {market.description && (
          <p className="expanded-description">{market.description}</p>
        )}
      </div>
    </div>
  )
}

export default ModernMarketCard
