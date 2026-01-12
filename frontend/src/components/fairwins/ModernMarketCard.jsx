import { useState, useMemo } from 'react'
import { findSubcategoryById } from '../../config/subcategories'
import './ModernMarketCard.css'

// Import category background images from assets/default/
import politicsImg from '../../assets/default/politics_0000.jpg'
import sportsImg from '../../assets/default/sports_0005.jpg'
import cryptoImg from '../../assets/default/crypto_0019.jpg'
import financeImg from '../../assets/default/finance_0014.jpg'
import techImg from '../../assets/default/tech_0030.jpg'
import popCultureImg from '../../assets/default/pop-culture_0010.jpg'
import weatherImg from '../../assets/default/weather_0024.jpg'

// Category background images mapping
const getCategoryThumbnail = (category) => {
  const thumbnails = {
    politics: politicsImg,
    sports: sportsImg,
    crypto: cryptoImg,
    finance: financeImg,
    tech: techImg,
    'pop-culture': popCultureImg,
    weather: weatherImg,
    other: financeImg
  }
  return thumbnails[category] || financeImg
}

/**
 * Get the image URL for a market
 * Uses custom IPFS image if available, falls back to category thumbnail
 * @param {Object} market - Market data
 * @returns {string} Image URL
 */
const getMarketImage = (market) => {
  // Check for custom image from IPFS metadata
  if (market.image) {
    // Handle ipfs:// URIs
    if (market.image.startsWith('ipfs://')) {
      const cid = market.image.replace('ipfs://', '')
      // Use Pinata gateway or fallback
      const gateway = import.meta.env.VITE_PINATA_GATEWAY || 'https://gateway.pinata.cloud'
      return `${gateway}/ipfs/${cid}`
    }
    // Handle https:// URLs directly
    if (market.image.startsWith('https://')) {
      return market.image
    }
    // Handle raw CIDs
    if (market.image.startsWith('Qm') || market.image.startsWith('b')) {
      const gateway = import.meta.env.VITE_PINATA_GATEWAY || 'https://gateway.pinata.cloud'
      return `${gateway}/ipfs/${market.image}`
    }
  }
  // Fall back to category thumbnail
  return getCategoryThumbnail(market.category)
}

// Get subcategory display name
const getSubcategoryName = (subcategoryId) => {
  const subcategory = findSubcategoryById(subcategoryId)
  return subcategory ? subcategory.name : subcategoryId
}

// Format number for display
const formatNumber = (num) => {
  const n = parseFloat(num)
  if (Number.isNaN(n)) return '0'
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

// Sparkline SVG dimensions
const SPARKLINE_WIDTH = 80
const SPARKLINE_HEIGHT = 28
const SPARKLINE_PADDING = 2

// Ring gauge constants  
const RING_RADIUS = 40
const RING_START_OFFSET = 0.25 // Start from top (quarter turn)

// Ring color thresholds
const RING_LOW_THRESHOLD = 33
const RING_MID_THRESHOLD = 66

// Get ring color based on probability and market status
const getRingColor = (probability, marketStatus) => {
  // Grey for paused or closed markets
  if (marketStatus === 'paused' || marketStatus === 'closed' || marketStatus === 'resolved') {
    return '#9ca3af' // grey
  }
  
  const prob = parseFloat(probability)
  if (prob <= RING_LOW_THRESHOLD) {
    return '#ef4444' // red (0-33%)
  } else if (prob <= RING_MID_THRESHOLD) {
    return '#3b82f6' // blue (33-66%)
  } else {
    return '#22c55e' // green (66-100%)
  }
}

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
  
  // Avoid division by zero or near-zero values
  if (!Number.isFinite(first) || Math.abs(first) < 1e-8) {
    return {
      direction: last >= first ? 'up' : 'down',
      change: 0
    }
  }
  
  const rawChange = ((last - first) / first) * 100
  const change = Math.abs(rawChange.toFixed(0))
  return {
    direction: last >= first ? 'up' : 'down',
    change
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
  isActive = false,
  isFirstRow = false
}) {
  const [isExpanded, setIsExpanded] = useState(isFirstRow)

  // Get bet type labels from market or default to Yes/No
  const passLabel = market.betTypeLabels?.passLabel || 'Yes'
  const failLabel = market.betTypeLabels?.failLabel || 'No'

  const yesProb = useMemo(() => (parseFloat(market.passTokenPrice) * 100).toFixed(0), [market.passTokenPrice])
  const noProb = useMemo(() => (100 - parseFloat(yesProb)).toFixed(0), [yesProb])
  
  // Get ring color based on probability and market status
  const ringColor = useMemo(() => getRingColor(yesProb, market.status), [yesProb, market.status])
  
  const sparklineData = useMemo(() => generateSparklineData(market), [market.id, market.passTokenPrice])
  const trend = useMemo(() => calculateTrend(sparklineData), [sparklineData])
  
  // Get subcategory display name
  const subcategoryName = useMemo(() => 
    market.subcategory ? getSubcategoryName(market.subcategory) : null, 
    [market.subcategory]
  )

  // Precompute sparkline points (shared by path and area)
  const sparklinePoints = useMemo(() => {
    const min = Math.min(...sparklineData)
    const max = Math.max(...sparklineData)
    const range = max - min || 0.1

    return sparklineData.map((val, i) => {
      const x =
        SPARKLINE_PADDING +
        (i / (sparklineData.length - 1)) *
          (SPARKLINE_WIDTH - 2 * SPARKLINE_PADDING)
      const y =
        SPARKLINE_PADDING +
        (1 - (val - min) / range) *
          (SPARKLINE_HEIGHT - 2 * SPARKLINE_PADDING)
      return `${x},${y}`
    })
  }, [sparklineData])

  // Create SVG path for sparkline
  const sparklinePath = useMemo(() => {
    return `M ${sparklinePoints.join(' L ')}`
  }, [sparklinePoints])

  // Create area path for sparkline
  const sparklineArea = useMemo(() => {
    const firstX = SPARKLINE_PADDING
    const lastX =
      SPARKLINE_PADDING + (SPARKLINE_WIDTH - 2 * SPARKLINE_PADDING)

    return `M ${firstX},${SPARKLINE_HEIGHT - SPARKLINE_PADDING} L ${sparklinePoints.join(
      ' L '
    )} L ${lastX},${SPARKLINE_HEIGHT - SPARKLINE_PADDING} Z`
  }, [sparklinePoints])

  // Calculate gauge arc for full circle (use circumference and dashoffset so 100% => full circle)
  const gaugeArc = useMemo(() => {
    const percent = Math.max(0, Math.min(100, parseFloat(yesProb) || 0))
    const circumference = Math.PI * 2 * RING_RADIUS
    const dashArray = circumference
    // dashOffset: 0 = fully filled, circumference = hidden. We want percent fill: offset = circumference * (1 - percent/100)
    const dashOffset = circumference * (1 - percent / 100)
    return { dashArray, dashOffset, circumference }
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

  const handleMouseEnter = () => {
    if (!isFirstRow) setIsExpanded(true)
  }
  const handleMouseLeave = () => {
    if (!isFirstRow) setIsExpanded(false)
  }

  return (
    <div 
      className={`modern-market-card ${isActive ? 'active' : ''} ${isExpanded ? 'expanded' : ''}`}
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
      {market.correlationGroup?.groupId !== undefined && (
        <div className="correlation-indicator" title={market.correlationGroup.groupName} />
      )}

      {/* Background thumbnail with question text overlay */}
      <div className="card-thumbnail">
        <img
          src={getMarketImage(market)}
          alt={market.proposalTitle || `${market.category} category`}
          className="thumbnail-image"
          onError={(e) => {
            // Fall back to category thumbnail if custom image fails to load
            e.target.src = getCategoryThumbnail(market.category)
          }}
        />

      {/* Stats row */}
      <div className="stats-row">
        <div className="stat-item volume" data-label="Volume" data-emoji="📊">
          <div className="stat-label">Volume</div>
          <div className="stat-value">
            {market.volume24h != null
              ? `$${formatNumber(market.volume24h)}`
              : 'N/A'}
          </div>
        </div>
        <div className="stat-item" data-label="Liquidity" data-emoji="💧">
          <div className="stat-label">Liquidity</div>
          <div className="stat-value">${formatNumber(market.totalLiquidity)}</div>
        </div>
        <div className="stat-item" data-label="Traders" data-emoji="👥">
          <div className="stat-label">Traders</div>
          <div className="stat-value">
            {market.uniqueTraders != null
              ? formatNumber(market.uniqueTraders)
              : market.tradesCount != null
                ? formatNumber(market.tradesCount)
                : 'N/A'}
          </div>
        </div>
      </div>

        <div className="thumbnail-overlay">
          {/* Header with badges - positioned at top of image */}
          <div className="card-header">
            <div className="card-badges">
              {/* Show subcategory instead of category since we pre-sort by category */}
              {subcategoryName && (
                <span className={`category-pill ${market.category}`}>
                  {subcategoryName}
                </span>
              )}
              {/* Show correlation group name instead of "Group" */}
              {market.correlationGroup?.groupName && (
                <span className="correlation-group-pill" title={market.correlationGroup.groupName}>
                  {market.correlationGroup.groupName}
                </span>
              )}
            </div>
            <span className="resolution-date">
              {formatTimeRemaining(market.tradingEndTime)}
            </span>
          </div>
          
          {/* Primary question text over the background image */}
          {market.description && (
          <p className="card-description">{market.description}</p>
        )}
          <h3 className="card-title">{market.proposalTitle}</h3>
        </div>
      </div>

      {/* Top section: Ring gauge and trend aligned horizontally */}
      <div className="gauge-trend-section">
        {/* Full Ring Probability Gauge */}
        <div className="probability-ring">
          <svg viewBox="0 0 100 100">
            {/* Background ring */}
            <circle
              className="ring-bg"
              cx="50"
              cy="50"
              r="40"
              fill="none"
            />
            {/* Filled ring based on YES probability with color based on threshold */}
            <circle
              className="ring-fill"
              cx="50"
              cy="50"
              r="40"
              fill="none"
              style={{
                stroke: ringColor,
                strokeDasharray: gaugeArc.dashArray,
                strokeDashoffset: gaugeArc.dashOffset,
                transform: 'rotate(-90deg)',
                transformOrigin: 'center'
              }}
            />
          </svg>
          
          {/* Center content */}
          <div className="ring-center">
            <span className="ring-percentage" style={{ color: ringColor }}>{yesProb}%</span>
            <span className="ring-label" style={{ color: ringColor }}></span>
          </div>
        </div>

        {/* Sparkline and trend */}
        <div className="trend-section">
          <div className="trend-label">Price History</div>
          <div className="sparkline-container-v2">
            <svg viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`} preserveAspectRatio="none">
              <path
                className="sparkline-area"
                d={sparklineArea}
                fill={trend.direction === 'up' ? '#36B37E' : '#e17055'}
              />
              <path
                className="sparkline-line"
                d={sparklinePath}
                stroke={trend.direction === 'up' ? '#36B37E' : '#e17055'}
              />
            </svg>
          </div>
          <div>
          
      {/* Tags row - use existing market tags */}
      {market.tags && market.tags.length > 0 && (
        <div className="tags-row">
          {market.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="market-tag">{tag}</span>
          ))}
        </div>
      )}
          </div>
          
        </div>
      </div>


      {/* Binary action buttons using bet type labels */}
      { isExpanded && (
      <div className="action-buttons">
        <button
          className="action-btn yes-btn"
          onClick={handleYesClick}
          aria-label={`Buy ${passLabel} on ${market.proposalTitle}`}
        >
          <span className="btn-label">{passLabel}</span>
          <span className="btn-price">{yesProb}¢</span>
        </button>
        <button
          className="action-btn no-btn"
          onClick={handleNoClick}
          aria-label={`Buy ${failLabel} on ${market.proposalTitle}`}
        >
          <span className="btn-label">{failLabel}</span>
          <span className="btn-price">{noProb}¢</span>
        </button>
      </div>
      )}
      
    </div>
  )
}

export default ModernMarketCard
