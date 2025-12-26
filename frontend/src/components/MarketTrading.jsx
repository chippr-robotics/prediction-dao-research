import { useState, useEffect, useCallback } from 'react'
import { useWeb3 } from '../hooks/useWeb3'
import { usePrice } from '../contexts/PriceContext'
import { useTheme } from '../hooks/useTheme'
import { getMockMarkets } from '../utils/mockDataLoader'
import CurrencyToggle from './ui/CurrencyToggle'
import './MarketTrading.css'

function MarketTrading() {
  const { isConnected } = useWeb3()
  const { formatPrice } = usePrice()
  const { isClearPath } = useTheme()
  const [markets, setMarkets] = useState([])
  const [selectedMarket, setSelectedMarket] = useState(null)
  const [tradeAmount, setTradeAmount] = useState('')
  const [tradeType, setTradeType] = useState('PASS')
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState({})
  const [searchQuery, setSearchQuery] = useState('')

  const loadMarkets = useCallback(async () => {
    try {
      // Load mock data from centralized source
      // In production, this would fetch from ConditionalMarketFactory contract
      const mockMarkets = getMockMarkets()

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
      const privacyNote = isClearPath 
        ? `\n\nThis would submit an encrypted position through the PrivacyCoordinator contract using:
- Poseidon encryption for position privacy
- zkSNARK proofs for validity
- MACI-style key-change capability`
        : `\n\nThis is a transparent market - all trades are publicly visible on the blockchain.`
      
      alert(`Trading functionality requires deployed contracts. 
      
Trade Details:
- Market: ${selectedMarket.proposalTitle}
- Type: ${tradeType}
- Amount: ${tradeAmount} ETC
- Price: ${tradeType === 'PASS' ? selectedMarket.passTokenPrice : selectedMarket.failTokenPrice} ETC${privacyNote}`)

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
        <div className="header-controls">
          <CurrencyToggle />
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
                          <span className="meta-value">{formatPrice(market.totalLiquidity, { compact: true })}</span>
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
                  aria-label={`Select PASS token at ${formatPrice(selectedMarket.passTokenPrice, { showBoth: true })}`}
                >
                  <span aria-hidden="true">↑</span> PASS<br />
                  <small>{formatPrice(selectedMarket.passTokenPrice, { showBoth: true })}</small>
                </button>
                <button
                  type="button"
                  className={`token-button ${tradeType === 'FAIL' ? 'active' : ''}`}
                  onClick={() => setTradeType('FAIL')}
                  aria-pressed={tradeType === 'FAIL'}
                  aria-label={`Select FAIL token at ${formatPrice(selectedMarket.failTokenPrice, { showBoth: true })}`}
                >
                  <span aria-hidden="true">↓</span> FAIL<br />
                  <small>{formatPrice(selectedMarket.failTokenPrice, { showBoth: true })}</small>
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

            {isClearPath && (
              <div className="privacy-notice" role="note">
                <span aria-hidden="true">🔐</span>
                <span>Your position will be encrypted using zero-knowledge proofs for privacy</span>
              </div>
            )}

            {!isClearPath && (
              <div className="transparency-notice" role="note">
                <span aria-hidden="true">👁️</span>
                <span>This is a transparent market - all trades are publicly visible</span>
              </div>
            )}

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
