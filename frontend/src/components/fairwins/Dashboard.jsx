import { useState, useEffect, useRef } from 'react'
import { useWeb3 } from '../../hooks/useWeb3'
import { useRoles } from '../../hooks/useRoles'
import { ROLES, ROLE_INFO } from '../../contexts/RoleContext'
import { getMockMarkets } from '../../utils/mockDataLoader'
import BlockiesAvatar from '../ui/BlockiesAvatar'
import * as d3 from 'd3'
import './Dashboard.css'

function Dashboard() {
  const { account, isConnected } = useWeb3()
  const { roles } = useRoles()
  const [platformMetrics, setPlatformMetrics] = useState({
    transactions24h: 0,
    openMarkets: 0,
    activeUsers: 0,
    totalLiquidity: 0,
    totalVolume: 0
  })
  const [recentActivity, setRecentActivity] = useState([])
  const [historicalData, setHistoricalData] = useState([])
  const marketChartRef = useRef(null)
  const liquidityChartRef = useRef(null)

  useEffect(() => {
    // Load platform metrics from mock data
    const markets = getMockMarkets()
    const activeMarkets = markets.filter(m => m.status === 'Active')
    
    // Calculate metrics
    const totalLiq = activeMarkets.reduce((sum, m) => sum + parseFloat(m.totalLiquidity || 0), 0)
    
    // Use stable mock data based on date seed for consistency
    const dateSeed = new Date().toDateString()
    const hash = dateSeed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const stableRandom = (seed) => {
      const x = Math.sin(seed) * 10000
      return x - Math.floor(x)
    }
    
    setPlatformMetrics({
      transactions24h: Math.floor(stableRandom(hash) * 500) + 200,
      openMarkets: activeMarkets.length,
      activeUsers: Math.floor(stableRandom(hash + 1) * 150) + 50,
      totalLiquidity: totalLiq,
      totalVolume: totalLiq * 1.5 // Estimate
    })

    // Generate recent activity (mock)
    const activities = [
      { type: 'trade', market: 'NFL Super Bowl 2025', user: '0x1234...5678', amount: '500 ETC', time: '2 min ago' },
      { type: 'create', market: 'Bitcoin hits $100k', user: '0xabcd...efgh', amount: '1000 ETC', time: '15 min ago' },
      { type: 'trade', market: 'Arsenal wins title', user: '0x9876...5432', amount: '250 ETC', time: '1 hour ago' },
      { type: 'resolve', market: 'Fed Rate Decision', user: '0xfedc...ba98', amount: '750 ETC', time: '3 hours ago' },
      { type: 'trade', market: 'Lakers reach playoffs', user: '0x2468...1357', amount: '300 ETC', time: '5 hours ago' }
    ]
    setRecentActivity(activities)

    // Generate historical data for charts (mock 30 days) with stable values
    const historical = []
    const today = new Date()
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const daySeed = hash + i
      historical.push({
        date,
        markets: Math.floor(stableRandom(daySeed) * 10) + activeMarkets.length - 15 + i,
        liquidity: Math.floor(stableRandom(daySeed + 100) * 5000) + totalLiq - 10000 + (i * 500),
        users: Math.floor(stableRandom(daySeed + 200) * 20) + 30 + i
      })
    }
    setHistoricalData(historical)
  }, [])

  // Render market growth chart
  useEffect(() => {
    if (!historicalData.length || !marketChartRef.current) return

    const container = marketChartRef.current

    const renderChart = () => {
      if (!historicalData.length || !container) return

      // Clear previous chart
      d3.select(container).selectAll('*').remove()

      const margin = { top: 20, right: 30, bottom: 40, left: 50 }
      const width = container.clientWidth - margin.left - margin.right
      const height = 250 - margin.top - margin.bottom

      const svg = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`)

      // X scale
      const x = d3.scaleTime()
        .domain(d3.extent(historicalData, d => d.date))
        .range([0, width])

      // Y scale
      const y = d3.scaleLinear()
        .domain([0, d3.max(historicalData, d => d.markets)])
        .nice()
        .range([height, 0])

      // Line generator
      const line = d3.line()
        .x(d => x(d.date))
        .y(d => y(d.markets))
        .curve(d3.curveMonotoneX)

      // Add X axis
      svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(5))
        .style('color', 'var(--text-secondary)')

      // Add Y axis
      svg.append('g')
        .call(d3.axisLeft(y))
        .style('color', 'var(--text-secondary)')

      // Add line
      svg.append('path')
        .datum(historicalData)
        .attr('fill', 'none')
        .attr('stroke', 'var(--primary-color, #00b894)')
        .attr('stroke-width', 2)
        .attr('d', line)

      // Add dots
      svg.selectAll('.dot')
        .data(historicalData)
        .enter()
        .append('circle')
        .attr('cx', d => x(d.date))
        .attr('cy', d => y(d.markets))
        .attr('r', 3)
        .attr('fill', 'var(--primary-color, #00b894)')
    }

    // Initial render
    renderChart()

    // Add resize observer for responsive charts
    let resizeObserver
    let handleResize

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        renderChart()
      })
      resizeObserver.observe(container)
    } else {
      // Fallback for browsers without ResizeObserver
      handleResize = () => {
        renderChart()
      }
      window.addEventListener('resize', handleResize)
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      if (handleResize) {
        window.removeEventListener('resize', handleResize)
      }
    }
  }, [historicalData])

  // Render liquidity chart
  useEffect(() => {
    if (!historicalData.length || !liquidityChartRef.current) return

    const container = liquidityChartRef.current

    const renderChart = () => {
      if (!historicalData.length || !container) return

      // Clear previous chart
      d3.select(container).selectAll('*').remove()

      const margin = { top: 20, right: 30, bottom: 40, left: 60 }
      const width = container.clientWidth - margin.left - margin.right
      const height = 250 - margin.top - margin.bottom

      const svg = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`)

      // X scale
      const x = d3.scaleTime()
        .domain(d3.extent(historicalData, d => d.date))
        .range([0, width])

      // Y scale
      const y = d3.scaleLinear()
        .domain([0, d3.max(historicalData, d => d.liquidity)])
        .nice()
        .range([height, 0])

      // Area generator
      const area = d3.area()
        .x(d => x(d.date))
        .y0(height)
        .y1(d => y(d.liquidity))
        .curve(d3.curveMonotoneX)

      // Add X axis
      svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(5))
        .style('color', 'var(--text-secondary)')

      // Add Y axis
      svg.append('g')
        .call(d3.axisLeft(y).tickFormat(d => `${(d / 1000).toFixed(0)}k`))
        .style('color', 'var(--text-secondary)')

      // Add area
      svg.append('path')
        .datum(historicalData)
        .attr('fill', 'var(--primary-color, #00b894)')
        .attr('fill-opacity', 0.3)
        .attr('stroke', 'var(--primary-color, #00b894)')
        .attr('stroke-width', 2)
        .attr('d', area)
    }

    // Initial render
    renderChart()

    // Add resize observer for responsive charts
    let resizeObserver
    let handleResize

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        renderChart()
      })
      resizeObserver.observe(container)
    } else {
      // Fallback for browsers without ResizeObserver
      handleResize = () => {
        renderChart()
      }
      window.addEventListener('resize', handleResize)
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      if (handleResize) {
        window.removeEventListener('resize', handleResize)
      }
    }
  }, [historicalData])

  const formatNumber = (num) => {
    const n = parseFloat(num)
    if (Number.isNaN(n) || n == null) return '0'
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return parseFloat(n.toFixed(2)).toString()
  }

  const getActivityIcon = (type) => {
    switch (type) {
      case 'trade': return '💱'
      case 'create': return '➕'
      case 'resolve': return '✅'
      default: return '📊'
    }
  }

  const getActivityLabel = (type) => {
    switch (type) {
      case 'trade': return 'Trade'
      case 'create': return 'Market Created'
      case 'resolve': return 'Market Resolved'
      default: return 'Activity'
    }
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>FairWins Platform Dashboard</h1>
        <p className="dashboard-subtitle">Live metrics and platform insights</p>
      </div>

      {/* Platform Health Metrics */}
      <section className="metrics-section">
        <h2 className="section-title">Platform Health</h2>
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-icon">📊</div>
            <div className="metric-content">
              <div className="metric-label">Transactions (24h)</div>
              <div className="metric-value">{formatNumber(platformMetrics.transactions24h)}</div>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon">🎯</div>
            <div className="metric-content">
              <div className="metric-label">Open Markets</div>
              <div className="metric-value">{platformMetrics.openMarkets}</div>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon">👥</div>
            <div className="metric-content">
              <div className="metric-label">Active Users</div>
              <div className="metric-value">{formatNumber(platformMetrics.activeUsers)}</div>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon">💰</div>
            <div className="metric-content">
              <div className="metric-label">Total Liquidity</div>
              <div className="metric-value">{formatNumber(platformMetrics.totalLiquidity)} ETC</div>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon">📈</div>
            <div className="metric-content">
              <div className="metric-label">24h Volume</div>
              <div className="metric-value">{formatNumber(platformMetrics.totalVolume)} ETC</div>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Growth Charts */}
      <section className="charts-section">
        <h2 className="section-title">Platform Growth (30 Days)</h2>
        <div className="charts-grid">
          <div className="chart-card">
            <h3 className="chart-title">Number of Markets</h3>
            <div ref={marketChartRef} className="chart-container"></div>
          </div>
          <div className="chart-card">
            <h3 className="chart-title">Total Liquidity (ETC)</h3>
            <div ref={liquidityChartRef} className="chart-container"></div>
          </div>
        </div>
      </section>

      {/* Recent Activity */}
      <section className="activity-section">
        <h2 className="section-title">Recent Activity</h2>
        <div className="activity-list">
          {recentActivity.map((activity, index) => (
            <div key={index} className="activity-item">
              <div className="activity-icon">{getActivityIcon(activity.type)}</div>
              <div className="activity-content">
                <div className="activity-header">
                  <span className="activity-type">{getActivityLabel(activity.type)}</span>
                  <span className="activity-time">{activity.time}</span>
                </div>
                <div className="activity-details">
                  <span className="activity-market">{activity.market}</span>
                  <span className="activity-user">{activity.user}</span>
                  <span className="activity-amount">{activity.amount}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* User Dashboard - Only shown when wallet is connected */}
      {isConnected && account && (
        <section className="user-dashboard-section">
          <h2 className="section-title">My Account</h2>
          <div className="user-info-card">
            <div className="user-header">
              <BlockiesAvatar address={account} size={48} className="user-avatar" />
              <div className="user-details">
                <div className="user-address">{account}</div>
                <div className="user-status">Connected</div>
              </div>
            </div>
          </div>

          {/* Role Cards */}
          <div className="roles-section">
            <h3 className="subsection-title">My Roles & Add-ons</h3>
            {roles.length > 0 ? (
              <div className="roles-grid">
                {roles.map((role) => {
                  const roleInfo = ROLE_INFO[role]
                  let logoName = ''
                  
                  if (role === ROLES.CLEARPATH_USER) {
                    logoName = 'clearpath'
                  } else if (role === ROLES.TOKENMINT) {
                    logoName = 'tokenmint'
                  } else if (role === ROLES.MARKET_MAKER || role === ROLES.ADMIN) {
                    logoName = 'fairwins'
                  }

                  return (
                    <div key={role} className="role-card">
                      {logoName && (
                        <div className="role-logo">
                          <img 
                            src={`/assets/${logoName}_no-text_logo.svg`} 
                            alt={`${roleInfo?.name} logo`}
                            className="role-logo-img"
                          />
                        </div>
                      )}
                      <div className="role-info">
                        <h4 className="role-name">{roleInfo?.name || role}</h4>
                        <p className="role-description">{roleInfo?.description || 'Special role'}</p>
                        {roleInfo?.premium && (
                          <div className="role-badge">Premium</div>
                        )}
                      </div>
                      <div className="role-details">
                        <div className="role-detail-item">
                          <span className="role-detail-label">Plan:</span>
                          <span className="role-detail-value">Active</span>
                        </div>
                        <div className="role-detail-item">
                          <span className="role-detail-label">Renewal:</span>
                          <span className="role-detail-value">30 days</span>
                        </div>
                        <div className="role-detail-item">
                          <span className="role-detail-label">Level:</span>
                          <span className="role-detail-value">Standard</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="no-roles-message">
                <p>You don't have any premium add-ons yet.</p>
                <p>Explore the marketplace to unlock additional features!</p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

export default Dashboard
