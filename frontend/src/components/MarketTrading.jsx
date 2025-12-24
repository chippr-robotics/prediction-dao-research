import { useState, useEffect, useCallback } from 'react'
import { useEthers } from '../hooks/useWeb3'

function MarketTrading() {
  const { provider, signer } = useEthers()
  const [markets, setMarkets] = useState([])
  const [selectedMarket, setSelectedMarket] = useState(null)
  const [tradeAmount, setTradeAmount] = useState('')
  const [tradeType, setTradeType] = useState('PASS')
  const [loading, setLoading] = useState(true)

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

  const handleTrade = async (e) => {
    e.preventDefault()

    if (!selectedMarket || !tradeAmount) {
      alert('Please select a market and enter a trade amount')
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

This would submit an encrypted position through the PrivacyCoordinator contract using:
- Poseidon encryption for position privacy
- zkSNARK proofs for validity
- MACI-style key-change capability`)

      setTradeAmount('')
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
    return <div className="loading">Loading prediction markets...</div>
  }

  if (markets.length === 0) {
    return <div className="no-markets">No active markets. Markets will appear when proposals are created.</div>
  }

  return (
    <div className="market-trading">
      <div className="markets-grid">
        {markets.map((market) => (
          <div 
            key={market.id} 
            className={`market-card ${selectedMarket?.id === market.id ? 'selected' : ''}`}
            onClick={() => setSelectedMarket(market)}
          >
            <h3>{market.proposalTitle}</h3>
            
            <div className="market-prices">
              <div className="price-item pass">
                <label>PASS Token</label>
                <div className="price">{market.passTokenPrice} ETC</div>
                <div className="probability">
                  {calculateImpliedProbability(market.passTokenPrice)}% implied
                </div>
              </div>
              <div className="price-item fail">
                <label>FAIL Token</label>
                <div className="price">{market.failTokenPrice} ETC</div>
                <div className="probability">
                  {calculateImpliedProbability(market.failTokenPrice)}% implied
                </div>
              </div>
            </div>

            <div className="market-info">
              <div className="info-item">
                <strong>Liquidity:</strong> {market.totalLiquidity} ETC
              </div>
              <div className="info-item">
                <strong>Time Remaining:</strong> {formatTimeRemaining(market.tradingEndTime)}
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
              <label>Token Type</label>
              <div className="token-selector">
                <button
                  type="button"
                  className={`token-button ${tradeType === 'PASS' ? 'active' : ''}`}
                  onClick={() => setTradeType('PASS')}
                >
                  PASS ({selectedMarket.passTokenPrice} ETC)
                </button>
                <button
                  type="button"
                  className={`token-button ${tradeType === 'FAIL' ? 'active' : ''}`}
                  onClick={() => setTradeType('FAIL')}
                >
                  FAIL ({selectedMarket.failTokenPrice} ETC)
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="tradeAmount">Amount (ETC)</label>
              <input
                type="number"
                id="tradeAmount"
                value={tradeAmount}
                onChange={(e) => setTradeAmount(e.target.value)}
                placeholder="Enter amount"
                step="0.01"
                min="0"
                required
              />
            </div>

            <div className="privacy-notice">
              🔐 Your position will be encrypted using Nightmarket-style zero-knowledge encryption
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
