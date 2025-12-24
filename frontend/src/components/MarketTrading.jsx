import { useState, useEffect, useCallback } from 'react'
import { useEthers } from '../hooks/useWeb3'
import './MarketTrading.css'

function MarketTrading() {
  const { provider, signer } = useEthers()
  const [markets, setMarkets] = useState([])
  const [selectedMarket, setSelectedMarket] = useState(null)
  const [tradeAmount, setTradeAmount] = useState('')
  const [tradeType, setTradeType] = useState('PASS')
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState({})

  const loadMarkets = useCallback(async () => {
    try {
      // Mock data for demonstration
      // In production, this would fetch from ConditionalMarketFactory contract
      // Note: provider and signer will be used when contracts are deployed
      const mockMarkets = [
        {
          id: 0,
          proposalId: 0,
          proposalTitle: 'Fund Core Protocol Development',
          passTokenPrice: '0.62',
          failTokenPrice: '0.38',
          totalLiquidity: '5000',
          tradingEndTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Active'
        },
        {
          id: 1,
          proposalId: 1,
          proposalTitle: 'Security Audit Funding',
          passTokenPrice: '0.55',
          failTokenPrice: '0.45',
          totalLiquidity: '3000',
          tradingEndTime: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'Active'
        }
      ]

      setMarkets(mockMarkets)
      setLoading(false)
    } catch (error) {
      console.error('Error loading markets:', error)
      setLoading(false)
    }
    // Note: provider and signer will be used in production
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadMarkets()
  }, [loadMarkets])

  const validateTrade = () => {
    const newErrors = {}
    
    if (!tradeAmount || parseFloat(tradeAmount) <= 0) {
      newErrors.tradeAmount = 'Please enter a valid amount greater than 0'
    }
    
    if (parseFloat(tradeAmount) > 10000) {
      newErrors.tradeAmount = 'Amount exceeds maximum trade size (10,000 ETC)'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleTrade = async (e) => {
    e.preventDefault()

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

  return (
    <div className="market-trading">
      <h2>Active Prediction Markets</h2>
      
      <div className="markets-grid">
        {markets.map((market) => (
          <div 
            key={market.id} 
            className={`market-card ${selectedMarket?.id === market.id ? 'selected' : ''}`}
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
            <h3>{market.proposalTitle}</h3>
            
            <div className="market-prices">
              <div className="price-item pass">
                <label>
                  <span className="sr-only">Upward arrow icon indicating PASS token</span>
                  PASS Token
                </label>
                <div className="price">{market.passTokenPrice} ETC</div>
                <div className="probability">
                  {calculateImpliedProbability(market.passTokenPrice)}% implied
                </div>
              </div>
              <div className="price-item fail">
                <label>
                  <span className="sr-only">Downward arrow icon indicating FAIL token</span>
                  FAIL Token
                </label>
                <div className="price">{market.failTokenPrice} ETC</div>
                <div className="probability">
                  {calculateImpliedProbability(market.failTokenPrice)}% implied
                </div>
              </div>
            </div>

            <div className="market-info">
              <div className="info-item">
                <strong>Liquidity:</strong> 
                <span>{market.totalLiquidity} ETC</span>
              </div>
              <div className="info-item">
                <strong>Time Remaining:</strong> 
                <span>{formatTimeRemaining(market.tradingEndTime)}</span>
              </div>
              <div className="info-item">
                <strong>Status:</strong>
                <span className="status-badge">
                  <span className="sr-only">Checkmark icon indicating active status</span>
                  {market.status}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

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
