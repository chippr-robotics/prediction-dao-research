import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState, useMemo, useRef } from 'react'
import * as d3 from 'd3'
import { getMockMarkets } from '../utils/mockDataLoader'
import { usePrice } from '../contexts/PriceContext'
import './CorrelatedMarketsPage.css'

const TIME_HORIZONS = {
  '7d': { label: '7 Days', dataPoints: 7 },
  '30d': { label: '30 Days', dataPoints: 30 },
  '90d': { label: '90 Days', dataPoints: 90 },
  'all': { label: 'All Time', dataPoints: 365 }
}

const parseProposalTitle = (title) => {
  return title.split(':')[1]?.trim() || title
}

function CorrelatedMarketsPage() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const [correlatedMarkets, setCorrelatedMarkets] = useState([])
  const [selectedOption, setSelectedOption] = useState(null)
  const [visibleMarkets, setVisibleMarkets] = useState({})
  const [pinnedMarkets, setPinnedMarkets] = useState(new Set())
  const [favoriteMarkets, setFavoriteMarkets] = useState(new Set())
  const [timeHorizon, setTimeHorizon] = useState('7d')
  const [loading, setLoading] = useState(true)
  const { formatPrice } = usePrice()
  const svgRef = useRef(null)
  const timelineRef = useRef(null)

  useEffect(() => {
    const loadMarkets = async () => {
      try {
        setLoading(true)
        const allMarkets = getMockMarkets()
        
        const correlated = allMarkets.filter(m => m.correlationGroupId === groupId)
        
        if (correlated.length === 0) {
          navigate('/app')
          return
        }
        
        setCorrelatedMarkets(correlated)
        setSelectedOption(correlated[0]?.id)
        setVisibleMarkets(correlated.reduce((acc, m) => ({ ...acc, [m.id]: true }), {}))
        setLoading(false)
      } catch (error) {
        console.error('Error loading markets:', error)
        setLoading(false)
        navigate('/app')
      }
    }
    
    loadMarkets()
  }, [groupId, navigate])

  const handleClose = () => {
    navigate(-1)
  }

  const toggleMarketVisibility = (marketId) => {
    setVisibleMarkets(prev => ({ ...prev, [marketId]: !prev[marketId] }))
  }

  const togglePinMarket = (marketId, e) => {
    e.stopPropagation()
    setPinnedMarkets(prev => {
      const newSet = new Set(prev)
      if (newSet.has(marketId)) {
        newSet.delete(marketId)
      } else {
        newSet.add(marketId)
      }
      return newSet
    })
  }

  const toggleFavoriteMarket = (marketId, e) => {
    e.stopPropagation()
    setFavoriteMarkets(prev => {
      const newSet = new Set(prev)
      if (newSet.has(marketId)) {
        newSet.delete(marketId)
      } else {
        newSet.add(marketId)
      }
      return newSet
    })
  }

  const handleViewDetails = (marketId, e) => {
    e.stopPropagation()
    navigate(`/market/${marketId}`)
  }

  const handleRowClick = (marketId) => {
    setSelectedOption(marketId)
  }

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

  const generateTimelineData = (market, horizon) => {
    const now = Date.now()
    const dataPoints = TIME_HORIZONS[horizon]?.dataPoints || 7
    const dayMs = 24 * 60 * 60 * 1000
    const baseProb = parseFloat(market.passTokenPrice) * 100
    
    return Array.from({ length: dataPoints }, (_, i) => ({
      date: new Date(now - (dataPoints - i - 1) * dayMs),
      probability: baseProb + (Math.random() - 0.5) * 15
    }))
  }

  useEffect(() => {
    if (!svgRef.current || radarData.length === 0) return

    const width = 350
    const height = 350
    const centerX = width / 2
    const centerY = height / 2
    const maxRadius = 120
    const levels = 5
    const angleSlice = (Math.PI * 2) / radarData.length

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

    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)

    const g = svg.append('g')
      .attr('transform', `translate(${centerX},${centerY})`)

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

    const enhancedData = []
    const innerCircleRadius = 0.15
    
    radarData.forEach((d, i) => {
      const radius = scaleRange > 0 ? (d.probability - scaleMin) / scaleRange : 0.5
      
      enhancedData.push({
        angle: angleSlice * i,
        radius: radius,
        label: d.label
      })
      
      enhancedData.push({
        angle: angleSlice * i + angleSlice / 2,
        radius: innerCircleRadius,
        label: null
      })
    })
    
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
    })

    const labelsGroup = g.append('g').attr('class', 'radar-labels-group').style('pointer-events', 'none')
    
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

  useEffect(() => {
    if (!timelineRef.current || radarData.length === 0) return

    const width = 900
    const height = 200
    const margin = { top: 20, right: 80, bottom: 40, left: 60 }
    const chartWidth = width - margin.left - margin.right
    const chartHeight = height - margin.top - margin.bottom

    d3.select(timelineRef.current).selectAll('*').remove()

    const svg = d3.select(timelineRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const allTimelines = radarData.map(market => ({
      id: market.id,
      label: market.label,
      data: generateTimelineData(
        correlatedMarkets.find(m => m.id === market.id),
        timeHorizon
      )
    }))

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

    const colorScale = d3.scaleOrdinal()
      .domain(radarData.map(d => d.id))
      .range(d3.schemeCategory10)

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

    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-chartWidth).tickFormat(''))
  }, [radarData, timeHorizon, selectedOption, correlatedMarkets])

  // Sort markets: pinned first, then others
  const sortedMarkets = useMemo(() => {
    const pinned = correlatedMarkets.filter(m => pinnedMarkets.has(m.id))
    const unpinned = correlatedMarkets.filter(m => !pinnedMarkets.has(m.id))
    return [...pinned, ...unpinned]
  }, [correlatedMarkets, pinnedMarkets])

  if (loading) {
    return (
      <div className="correlated-markets-page-backdrop">
        <div className="correlated-markets-page-container">
          <div className="loading-spinner"></div>
          <p>Loading markets...</p>
        </div>
      </div>
    )
  }

  const market = correlatedMarkets[0]
  if (!market) return null

  // Helper to format countdown timer
  const formatCountdown = (endTime) => {
    const now = new Date()
    const end = new Date(endTime)
    const diff = end - now
    
    if (diff <= 0) return 'Ended'
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  return (
    <div className="correlated-markets-page-backdrop">
      <div className="correlated-markets-page-container">
        <div className="correlated-markets-page">
          <div className="correlated-page-header">
            <img src="/assets/fairwins_no-text_logo.svg" alt="FairWins" className="correlated-page-logo" />
            <h2 className="correlated-page-title">{market.correlationGroupName || 'Correlated Markets'}</h2>
            <button className="correlated-page-close-btn" onClick={handleClose} aria-label="Close">×</button>
          </div>

          <p className="correlated-page-description">Compare all options in this linked market group</p>

          <div className="correlated-page-content">
            <div className="correlated-content-row">
              <div className="correlated-radar-section">
                <svg ref={svgRef} className="correlated-radar-chart"></svg>
              </div>

              <div className="correlated-table-section">
                <h3 className="correlated-table-title">Linked Markets</h3>
                <div className="correlated-table-container">
                  <table className="correlated-markets-table">
                    <thead>
                      <tr>
                        <th className="col-pin"></th>
                        <th className="col-market">Market</th>
                        <th className="col-countdown">Time Left</th>
                        <th className="col-type">Type</th>
                        <th className="col-yes-price">YES Price</th>
                        <th className="col-no-price">NO Price</th>
                        <th className="col-actions">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMarkets && sortedMarkets.length > 0 && sortedMarkets.map((option) => {
                        if (!option || !option.id) return null
                        
                        return (
                          <tr
                            key={option.id}
                            className={`market-row ${selectedOption === option.id ? 'selected' : ''} ${!visibleMarkets[option.id] ? 'hidden-market' : ''}`}
                            onClick={() => handleRowClick(option.id)}
                          >
                            <td className="col-pin">
                              <button
                                className={`pin-btn ${pinnedMarkets.has(option.id) ? 'pinned' : ''}`}
                                onClick={(e) => togglePinMarket(option.id, e)}
                                aria-label={pinnedMarkets.has(option.id) ? 'Unpin market' : 'Pin market'}
                                title={pinnedMarkets.has(option.id) ? 'Unpin' : 'Pin to top'}
                              >
                                📌
                              </button>
                            </td>
                            <td className="col-market">
                              <div className="market-name-container">
                                <button
                                  className={`favorite-btn ${favoriteMarkets.has(option.id) ? 'favorited' : ''}`}
                                  onClick={(e) => toggleFavoriteMarket(option.id, e)}
                                  aria-label={favoriteMarkets.has(option.id) ? 'Unfavorite' : 'Favorite'}
                                  title={favoriteMarkets.has(option.id) ? 'Remove from favorites' : 'Add to favorites'}
                                >
                                  {favoriteMarkets.has(option.id) ? '⭐' : '☆'}
                                </button>
                                <span className="market-name">{parseProposalTitle(option.proposalTitle || '')}</span>
                              </div>
                            </td>
                            <td className="col-countdown">
                              <span className="countdown">{formatCountdown(option.tradingEndTime)}</span>
                            </td>
                            <td className="col-type">
                              <span className="market-type">Binary</span>
                            </td>
                            <td className="col-yes-price">
                              <span className="price yes-price">${parseFloat(option.passTokenPrice || 0).toFixed(2)}</span>
                              <span className="probability">({(parseFloat(option.passTokenPrice || 0) * 100).toFixed(1)}%)</span>
                            </td>
                            <td className="col-no-price">
                              <span className="price no-price">${parseFloat(option.failTokenPrice || 0).toFixed(2)}</span>
                              <span className="probability">({(parseFloat(option.failTokenPrice || 0) * 100).toFixed(1)}%)</span>
                            </td>
                            <td className="col-actions">
                              <button
                                className="view-details-btn"
                                onClick={(e) => handleViewDetails(option.id, e)}
                                aria-label="View market details"
                              >
                                View Details
                              </button>
                              <button
                                className="visibility-btn"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleMarketVisibility(option.id)
                                }}
                                aria-label={visibleMarkets[option.id] ? 'Hide from chart' : 'Show in chart'}
                                title={visibleMarkets[option.id] ? 'Hide from chart' : 'Show in chart'}
                              >
                                {visibleMarkets[option.id] ? '👁️' : '👁️‍🗨️'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

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

export default CorrelatedMarketsPage
