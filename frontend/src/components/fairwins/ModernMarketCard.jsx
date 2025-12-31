import { useState, useMemo } from 'react'
import { usePrice } from '../../contexts/PriceContext'
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

// Format number for display
const formatNumber = (num) => {
  const n = parseFloat(num)
  if (Number.isNaN(n) || n == null) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return parseFloat(n.toFixed(0)).toString()
}

// Generate sparkline data points
const generateSparklineData = (market) => {
  // Use market ID as seed for consistent pseudo-random data
  const seed = market.id || 0
  const stableRandom = (s) => {
    const x = Math.sin(s) * 10000
    return x - Math.floor(x)
  }
  
  const basePrice = parseFloat(market.passTokenPrice) || 0.5
  const points = []
  
  for (let i = 0; i < 12; i++) {
    const variation = (stableRandom(seed + i * 7) - 0.5) * 0.15
    const price = Math.max(0.05, Math.min(0.95, basePrice + variation - (0.1 * (12 - i) / 12)))
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

// Generate random gamification stats based on market ID
const getGamificationStats = (market) => {
  const seed = market.id || 0
  const stableRandom = (s) => {
    const x = Math.sin(s) * 10000
    return x - Math.floor(x)
  }
  
  return {
    points: Math.floor(5 + stableRandom(seed + 100) * 15),
    streakBonus: Math.floor(stableRandom(seed + 200) * 20),
    accuracy: Math.floor(60 + stableRandom(seed + 300) * 35),
    comments: Math.floor(10 + stableRandom(seed + 400) * 90)
  }
}

function ModernMarketCard({ 
  market, 
  onClick, 
  onTrade, 
  onSimulate,
  isActive = false 
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { formatPrice } = usePrice()

  const yesProb = useMemo(() => (parseFloat(market.passTokenPrice) * 100).toFixed(0), [market.passTokenPrice])
  const noProb = useMemo(() => (100 - parseFloat(yesProb)).toFixed(0), [yesProb])
  
  const sparklineData = useMemo(() => generateSparklineData(market), [market])
  const trend = useMemo(() => calculateTrend(sparklineData), [sparklineData])
  const gamificationStats = useMemo(() => getGamificationStats(market), [market])

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

  // Calculate gauge arc
  const gaugeArc = useMemo(() => {
    const percent = parseFloat(yesProb)
    const circumference = Math.PI * 80 // Half circle with radius 80
    const offset = (percent / 100) * circumference
    return { dashArray: `${offset} ${circumference}`, circumference }
  }, [yesProb])

  const handleClick = () => {
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

  const handleTradeClick = (e) => {
    e.stopPropagation()
    if (onTrade) {
      onTrade(market)
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

  const handleMouseEnter = () => setIsExpanded(true)
  const handleMouseLeave = () => setIsExpanded(false)

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
          <span className={`category-pill ${market.category}`}>
            {market.category}
          </span>
          {market.correlationGroupId && (
            <span className="category-pill crypto" style={{ background: 'linear-gradient(135deg, #4C9AFF 0%, #2980b9 100%)' }}>
              Group
            </span>
          )}
        </div>
        <span className="resolution-date">
          {formatTimeRemaining(market.tradingEndTime)}
        </span>
      </div>

      {/* Card title */}
      <h3 className="card-title">{market.proposalTitle}</h3>

      {/* Probability gauge */}
      <div className="gauge-section">
        <div className="probability-gauge">
          <svg viewBox="0 0 160 90">
            <defs>
              <linearGradient id={`yesGradient-${market.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#36B37E" />
                <stop offset="50%" stopColor="#f1c40f" />
                <stop offset="100%" stopColor="#e17055" />
              </linearGradient>
            </defs>
            {/* Background arc */}
            <path
              className="gauge-bg"
              d="M 15 80 A 65 65 0 0 1 145 80"
              fill="none"
            />
            {/* Filled arc based on YES probability */}
            <path
              className="gauge-fill yes"
              d="M 15 80 A 65 65 0 0 1 145 80"
              fill="none"
              style={{
                stroke: `url(#yesGradient-${market.id})`,
                strokeDasharray: gaugeArc.dashArray
              }}
            />
            {/* Center indicator dot */}
            <circle cx="80" cy="80" r="4" fill="#fff" opacity="0.9" />
          </svg>
          
          {/* Center content */}
          <div className="gauge-center">
            <span className="gauge-percentage">{yesProb}%</span>
            <span className={`gauge-label yes`}>Yes</span>
          </div>
          
          {/* Side outcomes */}
          <div className="gauge-outcomes">
            <div className="outcome-side yes-side">
              <span className="outcome-percent">+{trend.change}%</span>
            </div>
            <div className="outcome-side no-side">
              <span className="outcome-percent">{noProb}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sparkline trend */}
      <div className="sparkline-section">
        <div className="sparkline-container">
          <svg viewBox="0 0 80 28" preserveAspectRatio="none">
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
        <div className={`trend-indicator ${trend.direction}`}>
          <span className="trend-arrow">{trend.direction === 'up' ? '↑' : '↓'}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="stats-row">
        <div className="stat-item">
          <span className="stat-icon">💰</span>
          <span className="stat-label">Volume</span>
          <span className="stat-value">${formatNumber(market.volume24h || market.totalLiquidity * 0.08)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-icon">💧</span>
          <span className="stat-label">Liquidity</span>
          <span className="stat-value">${formatNumber(market.totalLiquidity)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-icon">🔥</span>
          <span className="stat-label">Traders</span>
          <span className="stat-value">{market.uniqueTraders || formatNumber(market.tradesCount || 45)}</span>
        </div>
      </div>

      {/* Gamification row */}
      <div className="gamification-row">
        <div className="gamification-left">
          <div className="badge-item points-badge">
            <span className="badge-icon">🏆</span>
            <span>+{gamificationStats.points} pts</span>
          </div>
          <div className="badge-item streak-badge">
            <span className="badge-icon">🔥</span>
            <span>+{gamificationStats.streakBonus} pts</span>
          </div>
          <div className="accuracy-stat">
            Your Accuracy: <span className="accuracy-value">{gamificationStats.accuracy}%</span>
          </div>
        </div>
        <div className="hot-debate">
          <span className="hot-debate-icon">💬</span>
          <span>{gamificationStats.comments} comments</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="action-buttons">
        <button 
          className="action-btn primary"
          onClick={handleTradeClick}
          aria-label={`Trade on ${market.proposalTitle}`}
        >
          Trade
        </button>
        <button 
          className="action-btn secondary"
          onClick={handleSimulateClick}
          aria-label={`Simulate ${market.proposalTitle}`}
        >
          Simulate
        </button>
      </div>

      {/* Expanded content on hover */}
      <div className="card-expanded-content">
        {market.description && (
          <p className="expanded-description">{market.description}</p>
        )}
        {market.tags && market.tags.length > 0 && (
          <div className="expanded-tags">
            {market.tags.slice(0, 4).map((tag, index) => (
              <span key={index} className="tag-chip">{tag}</span>
            ))}
          </div>
        )}
        <button className="quick-quiz-btn" onClick={(e) => e.stopPropagation()}>
          Quick Quiz: Earn points
        </button>
      </div>
    </div>
  )
}

export default ModernMarketCard
