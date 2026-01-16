import { useRef, useEffect, useMemo } from 'react'
import * as d3 from 'd3'

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatETC = (num) => {
  const n = parseFloat(num)
  if (Number.isNaN(n) || n == null) return '0 ETC'
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M ETC`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K ETC`
  return `${n.toFixed(0)} ETC`
}

// Category colors matching the donut chart
const CATEGORY_COLORS = {
  sports: '#00b894',
  politics: '#0984e3',
  finance: '#e17055',
  tech: '#fdcb6e',
  crypto: '#a29bfe',
  'pop-culture': '#fd79a8',
  weather: '#74b9ff'
}

// Default categories if not provided
const DEFAULT_CATEGORIES = [
  { id: 'sports', name: 'Sports', icon: '⚽' },
  { id: 'politics', name: 'Politics', icon: '🏛️' },
  { id: 'finance', name: 'Finance', icon: '💰' },
  { id: 'tech', name: 'Tech', icon: '💻' },
  { id: 'crypto', name: 'Crypto', icon: '₿' },
  { id: 'pop-culture', name: 'Pop Culture', icon: '🎬' },
  { id: 'weather', name: 'Weather', icon: '🌤️' }
]

// ============================================================================
// DATA TRANSFORMATION
// ============================================================================

/**
 * Transform flat markets array into hierarchical data for D3 treemap
 * Structure: Root -> Categories -> Time-based Subcategories -> Value
 */
function buildTreemapData(markets, categories) {
  const now = new Date()
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const children = categories.map(cat => {
    const categoryMarkets = markets.filter(m => m.category === cat.id)

    // Create time-based subcategories
    const subcategories = [
      {
        name: 'Ending Soon',
        subcategoryId: 'ending-soon',
        markets: categoryMarkets.filter(m =>
          m.status === 'Active' && new Date(m.tradingEndTime) < in24Hours
        )
      },
      {
        name: 'Ending Later',
        subcategoryId: 'ending-later',
        markets: categoryMarkets.filter(m =>
          m.status === 'Active' && new Date(m.tradingEndTime) >= in24Hours
        )
      },
      {
        name: 'Resolved',
        subcategoryId: 'resolved',
        markets: categoryMarkets.filter(m => m.status === 'Resolved')
      }
    ]
      .filter(sub => sub.markets.length > 0)
      .map(sub => ({
        name: sub.name,
        subcategoryId: sub.subcategoryId,
        value: sub.markets.reduce((sum, m) => sum + parseFloat(m.totalLiquidity || 0), 0),
        marketCount: sub.markets.length,
        volume: sub.markets.reduce((sum, m) => sum + parseFloat(m.volume24h || 0), 0)
      }))

    return {
      name: cat.name,
      icon: cat.icon,
      categoryId: cat.id,
      children: subcategories
    }
  }).filter(cat => cat.children.length > 0)

  return {
    name: 'Markets',
    children
  }
}

// ============================================================================
// CATEGORY TREEMAP COMPONENT
// ============================================================================

/**
 * CategoryTreemap - D3 treemap visualization showing market categories and time-based subcategories
 *
 * @param {Object[]} markets - Array of market objects with category, status, tradingEndTime, totalLiquidity
 * @param {Object[]} categories - Array of category definitions with id, name, icon
 * @param {Function} onCellClick - Optional callback when a cell is clicked
 */
function CategoryTreemap({ markets = [], categories = DEFAULT_CATEGORIES, onCellClick }) {
  const svgRef = useRef()
  const containerRef = useRef()
  const tooltipRef = useRef()

  // Memoize treemap data to avoid recomputing on every render
  const treemapData = useMemo(() => {
    if (!markets?.length) return null
    return buildTreemapData(markets, categories)
  }, [markets, categories])

  useEffect(() => {
    if (!treemapData || !containerRef.current) return

    const renderChart = () => {
      const container = containerRef.current
      if (!container) return

      const width = container.clientWidth
      const height = 280
      const margin = { top: 4, right: 4, bottom: 4, left: 4 }

      // Clear previous content
      d3.select(svgRef.current).selectAll('*').remove()

      const svg = d3.select(svgRef.current)
        .attr('width', width)
        .attr('height', height)

      // Create hierarchy
      const root = d3.hierarchy(treemapData)
        .sum(d => d.value || 0)
        .sort((a, b) => b.value - a.value)

      // Create treemap layout
      const treemapLayout = d3.treemap()
        .size([width - margin.left - margin.right, height - margin.top - margin.bottom])
        .paddingOuter(3)
        .paddingTop(18)
        .paddingInner(2)
        .round(true)

      treemapLayout(root)

      // Calculate max volume for color scaling
      const maxVolume = d3.max(root.leaves(), d => d.data.volume || 0) || 1

      const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`)

      // Draw category groups (parent nodes at depth 1)
      const categoryNodes = root.children || []

      categoryNodes.forEach(catNode => {
        const categoryColor = CATEGORY_COLORS[catNode.data.categoryId] || '#666'
        const catGroup = g.append('g').attr('class', 'category-group')

        // Category background
        catGroup.append('rect')
          .attr('x', catNode.x0)
          .attr('y', catNode.y0)
          .attr('width', Math.max(0, catNode.x1 - catNode.x0))
          .attr('height', Math.max(0, catNode.y1 - catNode.y0))
          .attr('fill', categoryColor)
          .attr('fill-opacity', 0.12)
          .attr('rx', 4)
          .attr('stroke', categoryColor)
          .attr('stroke-opacity', 0.3)
          .attr('stroke-width', 1)

        // Category label (only if wide enough)
        const catWidth = catNode.x1 - catNode.x0
        if (catWidth > 60) {
          catGroup.append('text')
            .attr('x', catNode.x0 + 6)
            .attr('y', catNode.y0 + 13)
            .attr('fill', 'var(--text-primary)')
            .attr('font-size', '0.65rem')
            .attr('font-weight', '600')
            .text(`${catNode.data.icon} ${catNode.data.name}`)
        }
      })

      // Draw leaf cells (subcategories)
      const leaves = g.selectAll('.leaf')
        .data(root.leaves())
        .join('g')
        .attr('class', 'leaf')
        .style('cursor', onCellClick ? 'pointer' : 'default')

      // Cell rectangles
      leaves.append('rect')
        .attr('x', d => d.x0)
        .attr('y', d => d.y0)
        .attr('width', d => Math.max(0, d.x1 - d.x0))
        .attr('height', d => Math.max(0, d.y1 - d.y0))
        .attr('fill', d => {
          const categoryId = d.parent?.data?.categoryId
          return CATEGORY_COLORS[categoryId] || '#666'
        })
        .attr('fill-opacity', d => {
          // Scale opacity by volume (0.4 to 0.9)
          const volume = d.data.volume || 0
          return 0.4 + (volume / maxVolume) * 0.5
        })
        .attr('rx', 2)
        .attr('stroke', 'var(--bg-primary)')
        .attr('stroke-width', 1)
        .on('mouseenter', function(event, d) {
          d3.select(this)
            .transition()
            .duration(150)
            .attr('fill-opacity', 0.95)
            .attr('stroke-width', 2)
            .attr('stroke', 'var(--text-primary)')

          // Show tooltip
          const tooltip = d3.select(tooltipRef.current)
          const categoryName = d.parent?.data?.name || 'Unknown'
          tooltip
            .style('opacity', 1)
            .style('left', `${event.offsetX + 10}px`)
            .style('top', `${event.offsetY - 10}px`)
            .html(`
              <strong>${categoryName}</strong> - ${d.data.name}<br/>
              <span class="treemap-tooltip-value">${d.data.marketCount} market${d.data.marketCount !== 1 ? 's' : ''}</span><br/>
              <span class="treemap-tooltip-liquidity">${formatETC(d.data.value)}</span>
            `)
        })
        .on('mousemove', function(event) {
          d3.select(tooltipRef.current)
            .style('left', `${event.offsetX + 10}px`)
            .style('top', `${event.offsetY - 10}px`)
        })
        .on('mouseleave', function(event, d) {
          const volume = d.data.volume || 0
          const opacity = 0.4 + (volume / maxVolume) * 0.5
          d3.select(this)
            .transition()
            .duration(150)
            .attr('fill-opacity', opacity)
            .attr('stroke-width', 1)
            .attr('stroke', 'var(--bg-primary)')

          d3.select(tooltipRef.current).style('opacity', 0)
        })

      // Cell labels (only if cell is large enough)
      leaves.each(function(d) {
        const cellWidth = d.x1 - d.x0
        const cellHeight = d.y1 - d.y0
        const cell = d3.select(this)

        if (cellWidth > 45 && cellHeight > 28) {
          // Subcategory name
          cell.append('text')
            .attr('x', d.x0 + 4)
            .attr('y', d.y0 + 12)
            .attr('fill', 'var(--text-primary)')
            .attr('font-size', '0.55rem')
            .attr('font-weight', '500')
            .text(d.data.name)

          // Market count (only if tall enough)
          if (cellHeight > 40) {
            cell.append('text')
              .attr('x', d.x0 + 4)
              .attr('y', d.y0 + 22)
              .attr('fill', 'var(--text-secondary)')
              .attr('font-size', '0.5rem')
              .text(`${d.data.marketCount} mkts`)
          }
        }
      })

      // Click handler
      if (onCellClick) {
        leaves.on('click', (event, d) => {
          onCellClick({
            category: d.parent?.data?.categoryId,
            categoryName: d.parent?.data?.name,
            subcategory: d.data.subcategoryId,
            subcategoryName: d.data.name,
            marketCount: d.data.marketCount,
            liquidity: d.data.value,
            volume: d.data.volume
          })
        })
      }
    }

    renderChart()

    // Responsive resize
    const resizeObserver = new ResizeObserver(() => renderChart())
    resizeObserver.observe(containerRef.current)

    return () => resizeObserver.disconnect()
  }, [treemapData, onCellClick])

  // Empty state
  if (!markets?.length) {
    return (
      <div className="treemap-container treemap-empty">
        <p>No market data available</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="treemap-container"
      role="img"
      aria-label="Market category treemap showing distribution by category and time status"
    >
      <svg ref={svgRef} />
      <div
        ref={tooltipRef}
        className="treemap-tooltip"
        style={{ opacity: 0 }}
      />
    </div>
  )
}

export default CategoryTreemap
