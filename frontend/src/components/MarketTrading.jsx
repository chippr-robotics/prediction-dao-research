import { useState, useEffect, useCallback } from 'react'
import { useWeb3 } from '../hooks/useWeb3'
import './MarketTrading.css'

function MarketTrading() {
  const { isConnected } = useWeb3()
  const [markets, setMarkets] = useState([])
  const [selectedMarket, setSelectedMarket] = useState(null)
  const [tradeAmount, setTradeAmount] = useState('')
  const [tradeType, setTradeType] = useState('PASS')
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState({})
  const [searchQuery, setSearchQuery] = useState('')

  const loadMarkets = useCallback(async () => {
    try {
      // Mock data for demonstration with diverse categories
      // In production, this would fetch from ConditionalMarketFactory contract
      const mockMarkets = [
        // Sports Markets
        {
          id: 0,
          proposalTitle: 'NFL: Chiefs win Super Bowl 2025',
          category: 'sports',
          tags: ['nfl', 'football', 'championship'],
          passTokenPrice: '0.65',
          failTokenPrice: '0.35',
          totalLiquidity: '12500',
          tradingEndTime: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Active'
        },
        {
          id: 1,
          proposalTitle: 'NBA: Lakers reach playoffs',
          category: 'sports',
          tags: ['nba', 'basketball', 'playoffs'],
          passTokenPrice: '0.72',
          failTokenPrice: '0.28',
          totalLiquidity: '8900',
          tradingEndTime: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Active'
        },
        {
          id: 2,
          proposalTitle: 'Premier League: Arsenal wins title',
          category: 'sports',
          tags: ['soccer', 'premier-league', 'championship'],
          passTokenPrice: '0.48',
          failTokenPrice: '0.52',
          totalLiquidity: '15200',
          tradingEndTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Active'
        },
        {
          id: 3,
          proposalTitle: 'World Cup: Brazil reaches final',
          category: 'sports',
          tags: ['soccer', 'world-cup', 'international'],
          passTokenPrice: '0.58',
          failTokenPrice: '0.42',
          totalLiquidity: '21000',
          tradingEndTime: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Active'
        },
        // Politics Markets
        {
          id: 4,
          proposalTitle: 'US: Democrats win House 2024',
          category: 'politics',
          tags: ['election', 'us-politics', 'congress'],
          passTokenPrice: '0.51',
          failTokenPrice: '0.49',
          totalLiquidity: '32000',
          tradingEndTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Active'
        },
        {
          id: 5,
          proposalTitle: 'UK: Labour wins next election',
          category: 'politics',
          tags: ['election', 'uk-politics', 'parliament'],
          passTokenPrice: '0.67',
          failTokenPrice: '0.33',
          totalLiquidity: '18500',
          tradingEndTime: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Active'
        },
        {
          id: 6,
          proposalTitle: 'EU: New climate policy passes',
          category: 'politics',
          tags: ['policy', 'climate', 'environment'],
          passTokenPrice: '0.73',
          failTokenPrice: '0.27',
          totalLiquidity: '9800',
          tradingEndTime: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Active'
        },
        {
          id: 7,
          proposalTitle: 'Federal Reserve rate cut Q1 2025',
          category: 'politics',
          tags: ['economy', 'monetary-policy', 'fed'],
          passTokenPrice: '0.44',
          failTokenPrice: '0.56',
          totalLiquidity: '27500',
          tradingEndTime: new Date(Date.now() + 50 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Active'
        },
        // New Markets
        {
          id: 8,
          proposalTitle: 'ETH reaches $5000 by Q2 2025',
          category: 'new',
          tags: ['crypto', 'ethereum', 'price'],
          passTokenPrice: '0.42',
          failTokenPrice: '0.58',
          totalLiquidity: '19200',
          tradingEndTime: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Active'
        },
        {
          id: 9,
          proposalTitle: 'AI model surpasses GPT-4 benchmark',
          category: 'new',
          tags: ['ai', 'technology', 'benchmark'],
          passTokenPrice: '0.68',
          failTokenPrice: '0.32',
          totalLiquidity: '14700',
          tradingEndTime: new Date(Date.now() + 65 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Active'
        },
        {
          id: 10,
          proposalTitle: 'Tesla delivers 2M vehicles in 2024',
          category: 'new',
          tags: ['automotive', 'tesla', 'production'],
          passTokenPrice: '0.55',
          failTokenPrice: '0.45',
          totalLiquidity: '11300',
          tradingEndTime: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Active'
        },
        // DAO Governance Markets
        {
          id: 11,
          proposalTitle: 'Fund Core Protocol Development',
          category: 'daos',
          tags: ['governance', 'funding', 'development'],
          passTokenPrice: '0.62',
          failTokenPrice: '0.38',
          totalLiquidity: '5000',
          tradingEndTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Active'
        },
        {
          id: 12,
          proposalTitle: 'Security Audit Funding',
          category: 'daos',
          tags: ['governance', 'security', 'audit'],
          passTokenPrice: '0.55',
          failTokenPrice: '0.45',
          totalLiquidity: '3000',
          tradingEndTime: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Active'
        },
        {
          id: 13,
          proposalTitle: 'Uniswap: Fee structure change',
          category: 'daos',
          tags: ['defi', 'governance', 'uniswap'],
          passTokenPrice: '0.49',
          failTokenPrice: '0.51',
          totalLiquidity: '45000',
          tradingEndTime: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Active'
        },
        {
          id: 14,
          proposalTitle: 'Aave: New collateral type approval',
          category: 'daos',
          tags: ['defi', 'governance', 'aave'],
          passTokenPrice: '0.71',
          failTokenPrice: '0.29',
          totalLiquidity: '38500',
          tradingEndTime: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Active'
        }
      ]

      setMarkets(mockMarkets)
      setLoading(false)
    } catch (error) {
      console.error('Error loading markets:', error)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMarkets()
  }, [loadMarkets])

  const validateTrade = () => {
    const newErrors = {}
    
    if (!tradeAmount || parseFloat(tradeAmount) <= 0) {
      newErrors.tradeAmount = 'Please enter a valid amount greater than 0'
    } else if (parseFloat(tradeAmount) > 10000) {
      newErrors.tradeAmount = 'Amount exceeds maximum trade size (10,000 ETC)'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleTrade = async (e) => {
    e.preventDefault()

    if (!isConnected) {
      alert('Please connect your wallet to trade')
      return
    }

    if (!selectedMarket) {
      alert('Please select a market first')
      return
    }

    if (!validateTrade()) {
      return
    }

    try {
      // In production, this would interact with the ConditionalMarketFactory contract
      // and PrivacyCoordinator for encrypted positions
      alert(`Trading functionality requires deployed contracts. 
      
Trade Details:
- Market: ${selectedMarket.proposalTitle}
- Type: ${tradeType}
- Amount: ${tradeAmount} ETC
- Price: ${tradeType === 'PASS' ? selectedMarket.passTokenPrice : selectedMarket.failTokenPrice} ETC

This would submit an encrypted position through the PrivacyCoordinator contract using:
- Poseidon encryption for position privacy
- zkSNARK proofs for validity
- MACI-style key-change capability`)

      setTradeAmount('')
      setErrors({})
    } catch (error) {
      console.error('Error executing trade:', error)
      alert('Failed to execute trade: ' + error.message)
    }
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
    return `${days}d ${hours}h`
  }

  // Category configuration with icons
  const categories = [
    { slug: 'sports', name: 'Sports', icon: '⚽' },
    { slug: 'politics', name: 'Politics', icon: '🏛️' },
    { slug: 'new', name: 'New Markets', icon: '✨' },
    { slug: 'daos', name: 'DAO Governance', icon: '🏢' }
  ]

  // Filter markets based on search query
  const filterMarkets = (marketsList) => {
    if (!searchQuery.trim()) {
      return marketsList
    }

    const query = searchQuery.toLowerCase()
    return marketsList.filter(market => {
      const titleMatch = market.proposalTitle.toLowerCase().includes(query)
      const categoryMatch = market.category.toLowerCase().includes(query)
      const tagsMatch = market.tags.some(tag => tag.toLowerCase().includes(query))
      return titleMatch || categoryMatch || tagsMatch
    })
  }

  // Group filtered markets by category
  const getMarketsByCategory = () => {
    const filtered = filterMarkets(markets)
    const grouped = {}
    
    categories.forEach(cat => {
      grouped[cat.slug] = filtered.filter(m => m.category === cat.slug)
    })
    
    return grouped
  }

  if (loading) {
    return (
      <div className="loading" role="status" aria-live="polite">
        <span className="sr-only">Loading prediction markets...</span>
        Loading prediction markets...
      </div>
    )
  }

  if (markets.length === 0) {
    return (
      <div className="no-markets" role="status">
        <div className="placeholder-icon" aria-hidden="true">🎯</div>
        <p>No active markets. Markets will appear when proposals are created.</p>
      </div>
    )
  }

  const marketsByCategory = getMarketsByCategory()
  const hasFilteredResults = Object.values(marketsByCategory).some(cats => cats.length > 0)

  return (
    <div className="market-trading">
      <div className="markets-header">
        <h2>Explore Prediction Markets</h2>
        <div className="search-container">
          <label htmlFor="market-search" className="sr-only">
            Search markets by name, category, or tags
          </label>
          <input
            id="market-search"
            type="text"
            className="search-input"
            placeholder="Search markets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search prediction markets by name, category, or tags"
          />
          <span className="search-icon" aria-hidden="true">🔍</span>
        </div>
      </div>

      {!hasFilteredResults && searchQuery ? (
        <div className="no-results" role="status">
          <p>No markets found matching "{searchQuery}"</p>
          <button 
            className="clear-search-button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="categories-container">
          {categories.map((category) => {
            const categoryMarkets = marketsByCategory[category.slug]
            if (categoryMarkets.length === 0) return null

            return (
              <div key={category.slug} className="category-row">
                <div className="category-header">
                  <span className="category-icon" aria-hidden="true">{category.icon}</span>
                  <h3>{category.name}</h3>
                  <span className="category-count" aria-label={`${categoryMarkets.length} markets in ${category.name}`}>
                    ({categoryMarkets.length})
                  </span>
                </div>
                
                <div 
                  className="markets-carousel"
                  role="region"
                  aria-label={`${category.name} markets`}
                >
                  {categoryMarkets.map((market) => (
                    <div 
                      key={market.id} 
                      className={`market-card-compact ${selectedMarket?.id === market.id ? 'selected' : ''}`}
                      onClick={() => setSelectedMarket(market)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedMarket(market)
                        }
                      }}
                      role="button"
                      tabIndex="0"
                      aria-label={`Select market: ${market.proposalTitle}`}
                      aria-pressed={selectedMarket?.id === market.id}
                    >
                      <div className="card-header">
                        <span className="category-badge" aria-hidden="true">
                          {category.icon}
                        </span>
                      </div>
                      
                      <h4 className="market-title">{market.proposalTitle}</h4>
                      
                      <div className="market-odds">
                        <div className="odds-bar">
                          <div 
                            className="odds-fill" 
                            style={{ width: `${calculateImpliedProbability(market.passTokenPrice)}%` }}
                            aria-hidden="true"
                          />
                        </div>
                        <div className="odds-labels">
                          <span className="pass-odds">
                            {calculateImpliedProbability(market.passTokenPrice)}%
                          </span>
                          <span className="fail-odds">
                            {calculateImpliedProbability(market.failTokenPrice)}%
                          </span>
                        </div>
                      </div>

                      <div className="market-meta">
                        <div className="meta-item">
                          <span className="meta-label">Liquidity</span>
                          <span className="meta-value">{(parseFloat(market.totalLiquidity) / 1000).toFixed(1)}K</span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-label">Ends in</span>
                          <span className="meta-value">{formatTimeRemaining(market.tradingEndTime)}</span>
                        </div>
                      </div>

                      <button 
                        className="quick-trade-button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedMarket(market)
                        }}
                        aria-label={`Quick trade on ${market.proposalTitle}`}
                      >
                        Trade
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selectedMarket && (
        <div className="trading-panel">
          <h3>Trade on: {selectedMarket.proposalTitle}</h3>
          
          <form onSubmit={handleTrade}>
            <div className="form-group">
              <label id="token-type-label">Token Type</label>
              <div className="token-selector" role="group" aria-labelledby="token-type-label">
                <button
                  type="button"
                  className={`token-button ${tradeType === 'PASS' ? 'active' : ''}`}
                  onClick={() => setTradeType('PASS')}
                  aria-pressed={tradeType === 'PASS'}
                  aria-label={`Select PASS token at ${selectedMarket.passTokenPrice} ETC`}
                >
                  <span aria-hidden="true">↑</span> PASS ({selectedMarket.passTokenPrice} ETC)
                </button>
                <button
                  type="button"
                  className={`token-button ${tradeType === 'FAIL' ? 'active' : ''}`}
                  onClick={() => setTradeType('FAIL')}
                  aria-pressed={tradeType === 'FAIL'}
                  aria-label={`Select FAIL token at ${selectedMarket.failTokenPrice} ETC`}
                >
                  <span aria-hidden="true">↓</span> FAIL ({selectedMarket.failTokenPrice} ETC)
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="tradeAmount">
                Amount (ETC)
                <span className="required" aria-label="required">*</span>
              </label>
              <input
                type="number"
                id="tradeAmount"
                value={tradeAmount}
                onChange={(e) => {
                  setTradeAmount(e.target.value)
                  if (errors.tradeAmount) {
                    setErrors({})
                  }
                }}
                placeholder="Enter amount"
                step="0.01"
                min="0"
                required
                aria-required="true"
                aria-invalid={errors.tradeAmount ? "true" : "false"}
                aria-describedby={errors.tradeAmount ? "tradeAmount-error" : "tradeAmount-help"}
              />
              <small id="tradeAmount-help" className="helper-text">
                Minimum: 0.01 ETC, Maximum: 10,000 ETC
              </small>
              {errors.tradeAmount && (
                <span 
                  id="tradeAmount-error"
                  className="error-text" 
                  role="alert"
                  aria-live="assertive"
                >
                  {errors.tradeAmount}
                </span>
              )}
            </div>

            <div className="privacy-notice" role="note">
              <span aria-hidden="true">🔐</span>
              <span>Your position will be encrypted using Nightmarket-style zero-knowledge encryption</span>
            </div>

            <button type="submit" className="trade-submit-button">
              Execute Trade
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

export default MarketTrading
