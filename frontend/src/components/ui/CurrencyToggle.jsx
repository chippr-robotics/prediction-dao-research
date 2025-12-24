import { usePrice } from '../../contexts/PriceContext'
import './CurrencyToggle.css'

function CurrencyToggle() {
  const { showUsd, toggleCurrency, etcUsdRate, loading } = usePrice()

  return (
    <button
      className="currency-toggle"
      onClick={toggleCurrency}
      aria-label={`Currently showing prices in ${showUsd ? 'USD' : 'ETC'}. Click to toggle to ${showUsd ? 'ETC' : 'USD'}`}
      title={`Toggle between USD and ETC${etcUsdRate ? ` (1 ETC = $${etcUsdRate.toFixed(2)})` : ''}`}
      disabled={loading}
    >
      <span className={`currency-option ${showUsd ? 'active' : ''}`}>USD</span>
      <span className="currency-divider">|</span>
      <span className={`currency-option ${!showUsd ? 'active' : ''}`}>ETC</span>
    </button>
  )
}

export default CurrencyToggle
