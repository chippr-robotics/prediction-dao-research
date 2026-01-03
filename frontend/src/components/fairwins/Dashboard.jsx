import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useWeb3 } from '../../hooks/useWeb3'
import { getMockMarkets } from '../../utils/mockDataLoader'
import * as d3 from 'd3'
import './Dashboard.css'

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatNumber = (num) => {
  const n = parseFloat(num)
  if (Number.isNaN(n) || n == null) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return parseFloat(n.toFixed(2)).toString()
}

const formatETC = (num) => {
  const n = parseFloat(num)
  if (Number.isNaN(n) || n == null) return '0 ETC'
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M ETC`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K ETC`
  return `${n.toFixed(0)} ETC`
}

const getTimeRemaining = (endTime) => {
  const now = new Date()
  const end = new Date(endTime)
  const diff = end - now
  if (diff <= 0) return 'Ended'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `${days}d ${hours}h`
  return `${hours}h`
}

// Stable random generator for consistent mock data
const stableRandom = (seed) => {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

// Get category icon emoji
const getCategoryIcon = (category) => {
  const icons = {
    sports: '⚽',
    politics: '🏛️',
    finance: '💰',
    tech: '💻',
    crypto: '₿',
    'pop-culture': '🎬'
  }
  return icons[category] || '📊'
}

// ============================================================================
// CATEGORY DISTRIBUTION CHART (Donut with labels)
// ============================================================================

function CategoryDonutChart({ markets, categories }) {
  const svgRef = useRef()
  const containerRef = useRef()

  useEffect(() => {
    if (!markets?.length || !containerRef.current) return

    const renderChart = () => {
      const container = containerRef.current
      if (!container) return
      
      const width = container.clientWidth
      const height = 280
      const margin = 20
      const radius = Math.min(width * 0.4, height) / 2 - margin

      d3.select(svgRef.current).selectAll('*').remove()

      const svg = d3.select(svgRef.current)
        .attr('width', width)
        .attr('height', height)

      // Count markets by category
      const categoryData = categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        count: markets.filter(m => m.category === cat.id).length,
        liquidity: markets
          .filter(m => m.category === cat.id)
          .reduce((sum, m) => sum + parseFloat(m.totalLiquidity || 0), 0)
      })).filter(d => d.count > 0)

      const colorScale = d3.scaleOrdinal()
        .domain(categoryData.map(d => d.id))
        .range(['#00b894', '#0984e3', '#e17055', '#fdcb6e', '#a29bfe', '#fd79a8'])

      const pie = d3.pie()
        .value(d => d.liquidity)
        .sort(null)
        .padAngle(0.02)

      const arc = d3.arc()
        .innerRadius(radius * 0.55)
        .outerRadius(radius)

      const hoverArc = d3.arc()
        .innerRadius(radius * 0.55)
        .outerRadius(radius + 8)

      const g = svg.append('g')
        .attr('transform', `translate(${width * 0.35}, ${height / 2})`)

      // Draw arcs
      const arcs = g.selectAll('.arc')
        .data(pie(categoryData))
        .join('g')
        .attr('class', 'arc')

      arcs.append('path')
        .attr('d', arc)
        .attr('fill', d => colorScale(d.data.id))
        .attr('stroke', 'var(--bg-primary)')
        .attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .on('mouseenter', function() {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('d', hoverArc)
        })
        .on('mouseleave', function() {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('d', arc)
        })

      // Center text
      const totalLiquidity = categoryData.reduce((sum, d) => sum + d.liquidity, 0)
      
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.3em')
        .attr('fill', 'var(--text-primary)')
        .attr('font-size', '1.5rem')
        .attr('font-weight', '700')
        .text(formatNumber(totalLiquidity))

      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '1.2em')
        .attr('fill', 'var(--text-secondary)')
        .attr('font-size', '0.75rem')
        .text('Total Liquidity')

      // Legend on the right
      const legend = svg.append('g')
        .attr('transform', `translate(${width * 0.62}, ${height / 2 - (categoryData.length * 28) / 2})`)

      const legendItems = legend.selectAll('.legend-item')
        .data(categoryData)
        .join('g')
        .attr('class', 'legend-item')
        .attr('transform', (d, i) => `translate(0, ${i * 28})`)

      legendItems.append('rect')
        .attr('width', 14)
        .attr('height', 14)
        .attr('rx', 3)
        .attr('fill', d => colorScale(d.id))

      legendItems.append('text')
        .attr('x', 22)
        .attr('y', 11)
        .attr('fill', 'var(--text-primary)')
        .attr('font-size', '0.85rem')
        .text(d => `${d.icon} ${d.name}`)

      legendItems.append('text')
        .attr('x', 22)
        .attr('y', 24)
        .attr('fill', 'var(--text-secondary)')
        .attr('font-size', '0.7rem')
        .text(d => `${d.count} markets · ${formatETC(d.liquidity)}`)
    }

    renderChart()

    const resizeObserver = new ResizeObserver(() => renderChart())
    resizeObserver.observe(containerRef.current)

    return () => resizeObserver.disconnect()
  }, [markets, categories])

  return (
    <div ref={containerRef} className="chart-container">
      <svg ref={svgRef} />
    </div>
  )
}

// ============================================================================
// MARKET ACTIVITY HEATMAP (7 days x 24 hours)
// ============================================================================

function ActivityHeatmap({ markets }) {
  const svgRef = useRef()
  const containerRef = useRef()

  useEffect(() => {
    if (!containerRef.current) return

    const renderChart = () => {
      const container = containerRef.current
      if (!container) return
      
      const width = container.clientWidth
      const height = 200
      const margin = { top: 30, right: 20, bottom: 30, left: 50 }

      d3.select(svgRef.current).selectAll('*').remove()

      const svg = d3.select(svgRef.current)
        .attr('width', width)
        .attr('height', height)

      // Generate mock activity data (7 days x 24 hours)
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const hours = Array.from({ length: 24 }, (_, i) => i)
      
      const dateSeed = new Date().toDateString().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
      
      const data = []
      days.forEach((day, dayIdx) => {
        hours.forEach(hour => {
          // Higher activity during market hours and weekdays
          const baseActivity = stableRandom(dateSeed + dayIdx * 24 + hour) * 100
          const hourBonus = (hour >= 9 && hour <= 17) ? 30 : 0
          const dayBonus = (dayIdx >= 1 && dayIdx <= 5) ? 20 : 0
          data.push({
            day,
            dayIdx,
            hour,
            value: Math.min(100, baseActivity + hourBonus + dayBonus)
          })
        })
      })

      const cellWidth = (width - margin.left - margin.right) / 24
      const cellHeight = (height - margin.top - margin.bottom) / 7

      const colorScale = d3.scaleSequential()
        .domain([0, 100])
        .interpolator(d3.interpolateRgbBasis(['#1a1a2e', '#16213e', '#0f3460', '#00b894']))

      const g = svg.append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`)

      // Draw cells
      g.selectAll('rect')
        .data(data)
        .join('rect')
        .attr('x', d => d.hour * cellWidth)
        .attr('y', d => d.dayIdx * cellHeight)
        .attr('width', cellWidth - 2)
        .attr('height', cellHeight - 2)
        .attr('rx', 3)
        .attr('fill', d => colorScale(d.value))
        .style('cursor', 'pointer')
        .append('title')
        .text(d => `${d.day} ${d.hour}:00 - Activity: ${Math.round(d.value)}%`)

      // Y axis (days)
      svg.append('g')
        .attr('transform', `translate(${margin.left - 5}, ${margin.top})`)
        .selectAll('text')
        .data(days)
        .join('text')
        .attr('x', 0)
        .attr('y', (d, i) => i * cellHeight + cellHeight / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', 'var(--text-secondary)')
        .attr('font-size', '0.7rem')
        .text(d => d)

      // X axis (hours)
      svg.append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top - 8})`)
        .selectAll('text')
        .data([0, 6, 12, 18, 23])
        .join('text')
        .attr('x', d => d * cellWidth + cellWidth / 2)
        .attr('y', 0)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--text-secondary)')
        .attr('font-size', '0.7rem')
        .text(d => `${d}:00`)
    }

    renderChart()

    const resizeObserver = new ResizeObserver(() => renderChart())
    resizeObserver.observe(containerRef.current)

    return () => resizeObserver.disconnect()
  }, [markets])

  return (
    <div ref={containerRef} className="chart-container heatmap-container">
      <svg ref={svgRef} />
    </div>
  )
}

// ============================================================================
// LIQUIDITY FLOW STREAM GRAPH
// ============================================================================

function LiquidityStreamChart({ markets, categories }) {
  const svgRef = useRef()
  const containerRef = useRef()

  useEffect(() => {
    if (!markets?.length || !containerRef.current) return

    const renderChart = () => {
      const container = containerRef.current
      if (!container) return
      
      const width = container.clientWidth
      const height = 220
      const margin = { top: 20, right: 20, bottom: 30, left: 50 }

      d3.select(svgRef.current).selectAll('*').remove()

      const svg = d3.select(svgRef.current)
        .attr('width', width)
        .attr('height', height)

      // Generate 30 days of mock liquidity data per category
      const dateSeed = new Date().toDateString().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
      const days = 30
      
      const data = []
      for (let i = 0; i < days; i++) {
        const point = { date: new Date(Date.now() - (days - 1 - i) * 86400000) }
        categories.forEach((cat, catIdx) => {
          const baseLiquidity = markets
            .filter(m => m.category === cat.id)
            .reduce((sum, m) => sum + parseFloat(m.totalLiquidity || 0), 0)
          // Add some variation
          const variation = stableRandom(dateSeed + i * 6 + catIdx) * 0.3 - 0.15
          point[cat.id] = Math.max(0, baseLiquidity * (0.7 + i / days * 0.3 + variation))
        })
        data.push(point)
      }

      const keys = categories.map(c => c.id)
      
      const stack = d3.stack()
        .keys(keys)
        .offset(d3.stackOffsetWiggle)

      const series = stack(data)

      const xScale = d3.scaleTime()
        .domain(d3.extent(data, d => d.date))
        .range([margin.left, width - margin.right])

      const yScale = d3.scaleLinear()
        .domain([
          d3.min(series, s => d3.min(s, d => d[0])),
          d3.max(series, s => d3.max(s, d => d[1]))
        ])
        .range([height - margin.bottom, margin.top])

      const colorScale = d3.scaleOrdinal()
        .domain(keys)
        .range(['#00b894', '#0984e3', '#e17055', '#fdcb6e', '#a29bfe', '#fd79a8'])

      const area = d3.area()
        .x(d => xScale(d.data.date))
        .y0(d => yScale(d[0]))
        .y1(d => yScale(d[1]))
        .curve(d3.curveBasis)

      const g = svg.append('g')

      g.selectAll('path')
        .data(series)
        .join('path')
        .attr('fill', d => colorScale(d.key))
        .attr('fill-opacity', 0.8)
        .attr('d', area)
        .append('title')
        .text(d => categories.find(c => c.id === d.key)?.name)

      // X axis
      svg.append('g')
        .attr('transform', `translate(0, ${height - margin.bottom})`)
        .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.timeFormat('%b %d')))
        .selectAll('text')
        .attr('fill', 'var(--text-secondary)')
        .attr('font-size', '0.7rem')

      svg.selectAll('.domain, .tick line').attr('stroke', 'var(--border-color)')
    }

    renderChart()

    const resizeObserver = new ResizeObserver(() => renderChart())
    resizeObserver.observe(containerRef.current)

    return () => resizeObserver.disconnect()
  }, [markets, categories])

  return (
    <div ref={containerRef} className="chart-container">
      <svg ref={svgRef} />
    </div>
  )
}

// ============================================================================
// MARKET HEALTH GAUGE
// ============================================================================

// Health score calculation constants
const LIQUIDITY_NORMALIZATION_FACTOR = 200 // ETC - used to normalize liquidity to 100 scale
const EXPECTED_CATEGORY_COUNT = 6 // Number of market categories
const HEALTH_WEIGHT_ACTIVE = 40 // Weight for active markets percentage (out of 100)
const HEALTH_WEIGHT_LIQUIDITY = 0.35 // Weight for liquidity score
const HEALTH_WEIGHT_DIVERSITY = 0.25 // Weight for category diversity

function MarketHealthGauge({ markets }) {
  const svgRef = useRef()
  const containerRef = useRef()

  const healthScore = useMemo(() => {
    if (!markets?.length) return 0
    
    // Calculate health based on various factors
    const activeMarkets = markets.filter(m => m.status === 'Active').length
    const avgLiquidity = markets.reduce((sum, m) => sum + parseFloat(m.totalLiquidity || 0), 0) / markets.length
    const liquidityScore = Math.min(100, avgLiquidity / LIQUIDITY_NORMALIZATION_FACTOR)
    const diversityScore = new Set(markets.map(m => m.category)).size / EXPECTED_CATEGORY_COUNT * 100
    
    return Math.round(
      (activeMarkets / markets.length * HEALTH_WEIGHT_ACTIVE) + 
      (liquidityScore * HEALTH_WEIGHT_LIQUIDITY) + 
      (diversityScore * HEALTH_WEIGHT_DIVERSITY)
    )
  }, [markets])

  useEffect(() => {
    if (!containerRef.current) return

    const renderChart = () => {
      const container = containerRef.current
      if (!container) return
      
      const width = container.clientWidth
      const height = 180
      const margin = 20
      const radius = Math.min(width, height * 1.5) / 2 - margin

      d3.select(svgRef.current).selectAll('*').remove()

      const svg = d3.select(svgRef.current)
        .attr('width', width)
        .attr('height', height)

      const centerX = width / 2
      const centerY = height - 30

      // Background arc
      const backgroundArc = d3.arc()
        .innerRadius(radius - 20)
        .outerRadius(radius)
        .startAngle(-Math.PI / 2)
        .endAngle(Math.PI / 2)

      svg.append('path')
        .attr('d', backgroundArc)
        .attr('transform', `translate(${centerX}, ${centerY})`)
        .attr('fill', 'var(--border-color)')

      // Score arc with gradient color
      const getScoreColor = (score) => {
        if (score >= 80) return '#00b894'
        if (score >= 60) return '#00cec9'
        if (score >= 40) return '#fdcb6e'
        return '#e17055'
      }

      const scoreArc = d3.arc()
        .innerRadius(radius - 20)
        .outerRadius(radius)
        .startAngle(-Math.PI / 2)
        .endAngle(-Math.PI / 2 + (Math.PI * healthScore / 100))
        .cornerRadius(4)

      svg.append('path')
        .attr('d', scoreArc)
        .attr('transform', `translate(${centerX}, ${centerY})`)
        .attr('fill', getScoreColor(healthScore))

      // Score text
      svg.append('text')
        .attr('x', centerX)
        .attr('y', centerY - 25)
        .attr('text-anchor', 'middle')
        .attr('fill', getScoreColor(healthScore))
        .attr('font-size', '2.5rem')
        .attr('font-weight', '700')
        .text(healthScore)

      svg.append('text')
        .attr('x', centerX)
        .attr('y', centerY - 5)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--text-secondary)')
        .attr('font-size', '0.75rem')
        .text('Health Score')

      // Scale markers
      const markers = [0, 25, 50, 75, 100]
      markers.forEach(value => {
        const angle = -Math.PI / 2 + (Math.PI * value / 100)
        const x = centerX + Math.cos(angle) * (radius + 12)
        const y = centerY + Math.sin(angle) * (radius + 12)
        
        svg.append('text')
          .attr('x', x)
          .attr('y', y)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', 'var(--text-muted)')
          .attr('font-size', '0.65rem')
          .text(value)
      })
    }

    renderChart()

    const resizeObserver = new ResizeObserver(() => renderChart())
    resizeObserver.observe(containerRef.current)

    return () => resizeObserver.disconnect()
  }, [healthScore])

  return (
    <div ref={containerRef} className="chart-container gauge-container">
      <svg ref={svgRef} />
    </div>
  )
}

// ============================================================================
// PRICE MOMENTUM BARS
// ============================================================================

function PriceMomentumChart({ markets }) {
  const svgRef = useRef()
  const containerRef = useRef()

  const topMarkets = useMemo(() => {
    if (!markets?.length) return []
    
    return [...markets]
      .map(m => ({
        ...m,
        momentum: (parseFloat(m.passTokenPrice) - 0.5) * 100, // -50 to +50 scale
        liquidity: parseFloat(m.totalLiquidity || 0)
      }))
      .sort((a, b) => b.liquidity - a.liquidity)
      .slice(0, 8)
  }, [markets])

  useEffect(() => {
    if (!topMarkets?.length || !containerRef.current) return

    const renderChart = () => {
      const container = containerRef.current
      if (!container) return
      
      const width = container.clientWidth
      const height = 280
      const margin = { top: 20, right: 60, bottom: 20, left: 140 }

      d3.select(svgRef.current).selectAll('*').remove()

      const svg = d3.select(svgRef.current)
        .attr('width', width)
        .attr('height', height)

      const xScale = d3.scaleLinear()
        .domain([-50, 50])
        .range([margin.left, width - margin.right])

      const yScale = d3.scaleBand()
        .domain(topMarkets.map((_, i) => i))
        .range([margin.top, height - margin.bottom])
        .padding(0.25)

      const g = svg.append('g')

      // Center line
      g.append('line')
        .attr('x1', xScale(0))
        .attr('x2', xScale(0))
        .attr('y1', margin.top)
        .attr('y2', height - margin.bottom)
        .attr('stroke', 'var(--border-color)')
        .attr('stroke-width', 2)

      // Bars
      g.selectAll('.momentum-bar')
        .data(topMarkets)
        .join('rect')
        .attr('class', 'momentum-bar')
        .attr('x', d => d.momentum >= 0 ? xScale(0) : xScale(d.momentum))
        .attr('y', (d, i) => yScale(i))
        .attr('width', d => Math.abs(xScale(d.momentum) - xScale(0)))
        .attr('height', yScale.bandwidth())
        .attr('rx', 4)
        .attr('fill', d => d.momentum >= 0 ? '#00b894' : '#e17055')
        .attr('fill-opacity', 0.8)

      // Market labels
      g.selectAll('.market-label')
        .data(topMarkets)
        .join('text')
        .attr('class', 'market-label')
        .attr('x', margin.left - 8)
        .attr('y', (d, i) => yScale(i) + yScale.bandwidth() / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', 'var(--text-primary)')
        .attr('font-size', '0.7rem')
        .text(d => {
          const title = d.proposalTitle || ''
          return title.length > 20 ? title.substring(0, 20) + '...' : title
        })

      // Percentage labels
      g.selectAll('.pct-label')
        .data(topMarkets)
        .join('text')
        .attr('class', 'pct-label')
        .attr('x', d => d.momentum >= 0 ? xScale(d.momentum) + 8 : xScale(d.momentum) - 8)
        .attr('y', (d, i) => yScale(i) + yScale.bandwidth() / 2)
        .attr('text-anchor', d => d.momentum >= 0 ? 'start' : 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', d => d.momentum >= 0 ? '#00b894' : '#e17055')
        .attr('font-size', '0.75rem')
        .attr('font-weight', '600')
        .text(d => `${Math.round(parseFloat(d.passTokenPrice) * 100)}%`)

      // Axis labels
      svg.append('text')
        .attr('x', xScale(-25))
        .attr('y', height - 5)
        .attr('text-anchor', 'middle')
        .attr('fill', '#e17055')
        .attr('font-size', '0.7rem')
        .text('← Bearish')

      svg.append('text')
        .attr('x', xScale(25))
        .attr('y', height - 5)
        .attr('text-anchor', 'middle')
        .attr('fill', '#00b894')
        .attr('font-size', '0.7rem')
        .text('Bullish →')
    }

    renderChart()

    const resizeObserver = new ResizeObserver(() => renderChart())
    resizeObserver.observe(containerRef.current)

    return () => resizeObserver.disconnect()
  }, [topMarkets])

  return (
    <div ref={containerRef} className="chart-container momentum-container">
      <svg ref={svgRef} />
    </div>
  )
}

// ============================================================================
// VOLUME SPARKLINES GRID
// ============================================================================

function VolumeSparklines({ markets, categories }) {
  const containerRef = useRef()

  const categoryVolumes = useMemo(() => {
    const dateSeed = new Date().toDateString().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    
    return categories.map((cat, catIdx) => {
      const catMarkets = markets.filter(m => m.category === cat.id)
      const baseLiquidity = catMarkets.reduce((sum, m) => sum + parseFloat(m.totalLiquidity || 0), 0)
      
      // Generate 14 days of volume data
      const data = Array.from({ length: 14 }, (_, i) => {
        const variation = stableRandom(dateSeed + catIdx * 14 + i) * 0.4 - 0.2
        return baseLiquidity * 0.1 * (0.8 + variation + i * 0.02)
      })
      
      return {
        ...cat,
        data,
        total: baseLiquidity,
        change: ((data[data.length - 1] - data[0]) / data[0] * 100).toFixed(1)
      }
    })
  }, [markets, categories])

  return (
    <div ref={containerRef} className="sparklines-grid">
      {categoryVolumes.map(cat => (
        <SparklineCard key={cat.id} category={cat} />
      ))}
    </div>
  )
}

function SparklineCard({ category }) {
  const svgRef = useRef()

  useEffect(() => {
    if (!category.data?.length) return

    const width = 120
    const height = 40

    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)

    const xScale = d3.scaleLinear()
      .domain([0, category.data.length - 1])
      .range([0, width])

    const yScale = d3.scaleLinear()
      .domain([d3.min(category.data) * 0.9, d3.max(category.data) * 1.1])
      .range([height - 4, 4])

    const line = d3.line()
      .x((d, i) => xScale(i))
      .y(d => yScale(d))
      .curve(d3.curveMonotoneX)

    const area = d3.area()
      .x((d, i) => xScale(i))
      .y0(height)
      .y1(d => yScale(d))
      .curve(d3.curveMonotoneX)

    const isPositive = parseFloat(category.change) >= 0

    svg.append('path')
      .datum(category.data)
      .attr('d', area)
      .attr('fill', isPositive ? 'rgba(0, 184, 148, 0.15)' : 'rgba(225, 112, 85, 0.15)')

    svg.append('path')
      .datum(category.data)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', isPositive ? '#00b894' : '#e17055')
      .attr('stroke-width', 2)

    // End dot
    svg.append('circle')
      .attr('cx', xScale(category.data.length - 1))
      .attr('cy', yScale(category.data[category.data.length - 1]))
      .attr('r', 3)
      .attr('fill', isPositive ? '#00b894' : '#e17055')

  }, [category])

  const isPositive = parseFloat(category.change) >= 0

  return (
    <div className="sparkline-card">
      <div className="sparkline-header">
        <span className="sparkline-icon">{category.icon}</span>
        <span className="sparkline-name">{category.name}</span>
      </div>
      <svg ref={svgRef} className="sparkline-svg" />
      <div className="sparkline-footer">
        <span className="sparkline-total">{formatETC(category.total)}</span>
        <span className={`sparkline-change ${isPositive ? 'positive' : 'negative'}`}>
          {isPositive ? '↑' : '↓'} {Math.abs(parseFloat(category.change))}%
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// MARKET CRAWLER (Scrolling Ticker)
// ============================================================================

function MarketCrawler({ markets }) {
  const [isPaused, setIsPaused] = useState(false)

  const latestMarkets = useMemo(() => {
    if (!markets?.length) return []
    
    // Get latest active markets sorted by trading end time (latest ending first)
    return [...markets]
      .filter(m => m.status === 'Active')
      .sort((a, b) => new Date(b.tradingEndTime) - new Date(a.tradingEndTime))
      .slice(0, 12)
  }, [markets])

  // Duplicate markets for seamless infinite scroll
  const allMarkets = [...latestMarkets, ...latestMarkets]

  const handleFocus = () => setIsPaused(true)
  const handleBlur = () => setIsPaused(false)

  return (
    <div 
      className="market-crawler"
      role="region"
      aria-label="Latest markets ticker"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className={`crawler-track ${isPaused ? 'paused' : ''}`}>
        {allMarkets.map((market, index) => {
          const passPrice = parseFloat(market.passTokenPrice) || 0
          const isHighConfidence = passPrice > 0.7 || passPrice < 0.3
          
          return (
            <div 
              key={`${market.id}-${index}`} 
              className="crawler-item"
              tabIndex={0}
              onFocus={handleFocus}
              onBlur={handleBlur}
              role="article"
              aria-label={`${market.proposalTitle}, ${Math.round(passPrice * 100)}% YES probability`}
            >
              <span className="crawler-icon" aria-hidden="true">{getCategoryIcon(market.category)}</span>
              <span className="crawler-title">{market.proposalTitle}</span>
              <span className={`crawler-price ${isHighConfidence ? 'high-confidence' : ''}`}>
                {Math.round(passPrice * 100)}% YES
              </span>
              <span className="crawler-separator" aria-hidden="true">•</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// TRENDING MARKETS LIST
// ============================================================================

function TrendingMarketsList({ markets, onMarketClick }) {
  const trendingMarkets = useMemo(() => {
    if (!markets?.length) return []
    
    return [...markets]
      .filter(m => m.status === 'Active')
      .sort((a, b) => parseFloat(b.totalLiquidity) - parseFloat(a.totalLiquidity))
      .slice(0, 5)
  }, [markets])

  return (
    <div className="trending-list">
      {trendingMarkets.map((market, index) => {
        const passPrice = parseFloat(market.passTokenPrice) || 0
        const isHighConfidence = passPrice > 0.7 || passPrice < 0.3
        
        return (
          <div 
            key={market.id} 
            className="trending-item"
            onClick={() => onMarketClick?.(market)}
            role="button"
            tabIndex={0}
            onKeyPress={(e) => e.key === 'Enter' && onMarketClick?.(market)}
          >
            <div className="trending-rank">#{index + 1}</div>
            <div className="trending-content">
              <div className="trending-title">
                <span className="trending-category-icon">{getCategoryIcon(market.category)}</span>
                {market.proposalTitle}
              </div>
              <div className="trending-meta">
                <span className="trending-liquidity">{formatETC(market.totalLiquidity)}</span>
                <span className="trending-time">⏱ {getTimeRemaining(market.tradingEndTime)}</span>
              </div>
            </div>
            <div className={`trending-price ${isHighConfidence ? 'high-confidence' : ''}`}>
              <span className="price-value">{Math.round(passPrice * 100)}%</span>
              <span className="price-label">YES</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// RECENT ACTIVITY FEED
// ============================================================================

function RecentActivityFeed({ markets }) {
  const activities = useMemo(() => {
    const dateSeed = new Date().toDateString().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    
    const types = ['trade', 'create', 'resolve', 'liquidity']
    const users = ['0x1a2b...3c4d', '0x5e6f...7g8h', '0x9i0j...k1l2', '0xm3n4...o5p6', '0xq7r8...s9t0']
    
    return markets.slice(0, 8).map((market, i) => {
      const typeIdx = Math.floor(stableRandom(dateSeed + i) * types.length)
      const userIdx = Math.floor(stableRandom(dateSeed + i + 100) * users.length)
      const amount = Math.floor(stableRandom(dateSeed + i + 200) * 900) + 100
      const minutesAgo = Math.floor(stableRandom(dateSeed + i + 300) * 120) + 1
      
      return {
        id: i,
        type: types[typeIdx],
        market: market.proposalTitle,
        user: users[userIdx],
        amount: `${amount} ETC`,
        time: minutesAgo < 60 ? `${minutesAgo}m ago` : `${Math.floor(minutesAgo / 60)}h ago`
      }
    })
  }, [markets])

  const getActivityIcon = (type) => {
    switch (type) {
      case 'trade': return '💱'
      case 'create': return '✨'
      case 'resolve': return '✅'
      case 'liquidity': return '💧'
      default: return '📊'
    }
  }

  const getActivityLabel = (type) => {
    switch (type) {
      case 'trade': return 'Trade'
      case 'create': return 'Market Created'
      case 'resolve': return 'Market Resolved'
      case 'liquidity': return 'Liquidity Added'
      default: return 'Activity'
    }
  }

  return (
    <div className="activity-feed">
      {activities.map(activity => (
        <div key={activity.id} className="activity-feed-item">
          <div className="activity-feed-icon">{getActivityIcon(activity.type)}</div>
          <div className="activity-feed-content">
            <div className="activity-feed-header">
              <span className="activity-feed-type">{getActivityLabel(activity.type)}</span>
              <span className="activity-feed-time">{activity.time}</span>
            </div>
            <div className="activity-feed-market">{activity.market}</div>
            <div className="activity-feed-details">
              <span className="activity-feed-user">{activity.user}</span>
              <span className="activity-feed-amount">{activity.amount}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================

function Dashboard() {
  const { account, isConnected } = useWeb3()
  const [markets, setMarkets] = useState([])
  const [loading, setLoading] = useState(true)

  const categories = useMemo(() => [
    { id: 'sports', name: 'Sports', icon: '⚽' },
    { id: 'politics', name: 'Politics', icon: '🏛️' },
    { id: 'finance', name: 'Finance', icon: '💰' },
    { id: 'tech', name: 'Tech', icon: '💻' },
    { id: 'crypto', name: 'Crypto', icon: '₿' },
    { id: 'pop-culture', name: 'Pop Culture', icon: '🎬' }
  ], [])

  useEffect(() => {
    const loadMarkets = async () => {
      try {
        setLoading(true)
        await new Promise(resolve => setTimeout(resolve, 300))
        const allMarkets = getMockMarkets()
        setMarkets(allMarkets)
      } catch (error) {
        console.error('Error loading markets:', error)
      } finally {
        setLoading(false)
      }
    }
    loadMarkets()
  }, [])

  // Calculate platform metrics
  const platformMetrics = useMemo(() => {
    if (!markets.length) return null
    
    const activeMarkets = markets.filter(m => m.status === 'Active')
    const totalLiquidity = markets.reduce((sum, m) => sum + parseFloat(m.totalLiquidity || 0), 0)
    const avgPrice = markets.reduce((sum, m) => sum + parseFloat(m.passTokenPrice || 0.5), 0) / markets.length
    
    const dateSeed = new Date().toDateString().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    
    return {
      totalMarkets: activeMarkets.length,
      totalLiquidity,
      volume24h: totalLiquidity * (0.08 + stableRandom(dateSeed) * 0.04),
      activeTraders: Math.floor(150 + stableRandom(dateSeed + 1) * 100),
      avgSentiment: avgPrice
    }
  }, [markets])

  const handleMarketClick = useCallback((market) => {
    // Navigate to market - in real app would use router
    console.log('Navigate to market:', market.id)
  }, [])

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-loading">
          <div className="loading-spinner" />
          <p>Loading market data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Market Overview</h1>
          <p className="dashboard-subtitle">Real-time insights across all prediction markets</p>
        </div>
      </header>

      
      {/* Market Crawler - Latest Markets Ticker */}
      <MarketCrawler markets={markets} />

      {/* Main Charts Grid */}
      <section className="charts-section">
        <div className="charts-row">
          {/* Market Distribution */}
          <div className="chart-card wide">
            <div className="chart-header">
              <h3 className="chart-title">Market Distribution by Category</h3>
              <span className="chart-subtitle">Liquidity allocation across categories</span>
            </div>
            <CategoryDonutChart markets={markets} categories={categories} />
          </div>

          {/* Market Health */}
          <div className="chart-card">
            <div className="chart-header">
              <h3 className="chart-title">Platform Health</h3>
              <span className="chart-subtitle">Overall market health score</span>
            </div>
            <MarketHealthGauge markets={markets} />
          </div>
        </div>

        {/* Activity Section - Moved up */}
        <div className="bottom-grid">
          {/* Trending Markets */}
          <div className="bottom-card">
            <div className="bottom-header">
              <h3>🔥 Trending Markets</h3>
              <button className="view-all-btn">View All →</button>
            </div>
            <TrendingMarketsList markets={markets} onMarketClick={handleMarketClick} />
          </div>

          {/* Recent Activity */}
          <div className="bottom-card">
            <div className="bottom-header">
              <h3>⚡ Recent Activity</h3>
            </div>
            <RecentActivityFeed markets={markets} />
          </div>
        </div>

        {/* Volume Sparklines */}
        <div className="chart-card full-width">
          <div className="chart-header">
            <h3 className="chart-title">Category Performance</h3>
            <span className="chart-subtitle">14-day volume trends by category</span>
          </div>
          <VolumeSparklines markets={markets} categories={categories} />
        </div>

        <div className="charts-row">
          {/* Liquidity Flow */}
          <div className="chart-card wide">
            <div className="chart-header">
              <h3 className="chart-title">Liquidity Flow</h3>
              <span className="chart-subtitle">30-day liquidity distribution</span>
            </div>
            <LiquidityStreamChart markets={markets} categories={categories} />
          </div>

          {/* Activity Heatmap */}
          <div className="chart-card">
            <div className="chart-header">
              <h3 className="chart-title">Trading Activity</h3>
              <span className="chart-subtitle">Weekly activity patterns</span>
            </div>
            <ActivityHeatmap markets={markets} />
          </div>
        </div>

        {/* Price Momentum */}
        <div className="chart-card full-width">
          <div className="chart-header">
            <h3 className="chart-title">Market Sentiment</h3>
            <span className="chart-subtitle">Top markets by liquidity with YES probability</span>
          </div>
          <PriceMomentumChart markets={markets} />
        </div>
      </section>
    </div>
  )
}

export default Dashboard
