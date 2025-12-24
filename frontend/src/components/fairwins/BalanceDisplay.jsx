import { useETCswap } from '../../hooks/useETCswap'
import { TOKENS } from '../../constants/etcswap'
import './BalanceDisplay.css'

function BalanceDisplay() {
  const { balances, loading } = useETCswap()
  
  const formatBalance = (balance) => {
    const num = parseFloat(balance)
    if (num === 0) return '0.00'
    if (num < 0.01) return '< 0.01'
    return num.toFixed(4)
  }
  
  const tokens = [
    { ...TOKENS.ETC, balance: balances.etc },
    { ...TOKENS.WETC, balance: balances.wetc },
    { ...TOKENS.USC, balance: balances.usc }
  ]
  
  return (
    <div className="balance-display">
      <h3>Token Balances</h3>
      <div className="balance-grid">
        {tokens.map((token) => (
          <div key={token.symbol} className="balance-card">
            <div className="token-header">
              <span className="token-icon" aria-hidden="true">{token.icon}</span>
              <div className="token-info">
                <span className="token-symbol">{token.symbol}</span>
                <span className="token-name">{token.name}</span>
              </div>
            </div>
            <div className="token-balance">
              {loading ? (
                <div className="loading-skeleton"></div>
              ) : (
                <>
                  <span className="balance-value">{formatBalance(token.balance)}</span>
                  <span className="balance-symbol">{token.symbol}</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default BalanceDisplay
