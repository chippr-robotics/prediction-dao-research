import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { ETCSWAP_ADDRESSES } from '../../constants/etcswap'
import { useWallet } from '../../hooks/useWalletManagement'
import { ERC20_ABI } from '../../abis/ERC20'
import { WETC_ABI } from '../../abis/WETC'
import './CurrencySelector.css'

/**
 * Currency options for Friend Markets
 */
export const CURRENCY_OPTIONS = {
  USC: {
    id: 'USC',
    symbol: 'USC',
    name: 'Classic USD Stablecoin',
    address: ETCSWAP_ADDRESSES.USC_STABLECOIN,
    decimals: 6,
    icon: '💵',
    isNative: false,
    isDefault: true
  },
  ETC: {
    id: 'ETC',
    symbol: 'ETC',
    name: 'Ethereum Classic',
    address: 'native',
    decimals: 18,
    icon: '💎',
    isNative: true,
    isDefault: false
  },
  WETC: {
    id: 'WETC',
    symbol: 'WETC',
    name: 'Wrapped ETC',
    address: ETCSWAP_ADDRESSES.WETC,
    decimals: 18,
    icon: '🌐',
    isNative: false,
    isDefault: false
  }
}

/**
 * Get default currency (USC - stablecoin)
 */
export const getDefaultCurrency = () => CURRENCY_OPTIONS.USC

/**
 * CurrencySelector Component
 *
 * Allows users to select between ETC, WETC, and USC (stablecoin)
 * for friend market transactions.
 *
 * @param {Object} props
 * @param {string} props.selectedCurrency - Currently selected currency ID
 * @param {Function} props.onCurrencyChange - Callback when currency changes
 * @param {boolean} props.disabled - Whether the selector is disabled
 * @param {boolean} props.showBalances - Whether to show token balances
 * @param {string} props.className - Additional CSS class
 */
function CurrencySelector({
  selectedCurrency = 'USC',
  onCurrencyChange,
  disabled = false,
  showBalances = true,
  className = ''
}) {
  const { provider, address, isConnected } = useWallet()
  const [balances, setBalances] = useState({})
  const [loadingBalances, setLoadingBalances] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  // Get selected currency object
  const selectedOption = useMemo(() => {
    return CURRENCY_OPTIONS[selectedCurrency] || CURRENCY_OPTIONS.USC
  }, [selectedCurrency])

  // Fetch balances for all currencies
  const fetchBalances = useCallback(async () => {
    if (!provider || !address || !isConnected) return

    setLoadingBalances(true)
    try {
      const newBalances = {}

      // Fetch native ETC balance
      const etcBalance = await provider.getBalance(address)
      newBalances.ETC = ethers.formatEther(etcBalance)

      // Fetch WETC balance
      try {
        const wetcContract = new ethers.Contract(
          ETCSWAP_ADDRESSES.WETC,
          WETC_ABI,
          provider
        )
        const wetcBalance = await wetcContract.balanceOf(address)
        newBalances.WETC = ethers.formatEther(wetcBalance)
      } catch (e) {
        console.warn('Failed to fetch WETC balance:', e)
        newBalances.WETC = '0'
      }

      // Fetch USC (stablecoin) balance
      try {
        const uscContract = new ethers.Contract(
          ETCSWAP_ADDRESSES.USC_STABLECOIN,
          ERC20_ABI,
          provider
        )
        const uscBalance = await uscContract.balanceOf(address)
        // USC decimals defined in CURRENCY_OPTIONS
        newBalances.USC = ethers.formatUnits(uscBalance, CURRENCY_OPTIONS.USC.decimals)
      } catch (e) {
        console.warn('Failed to fetch USC balance:', e)
        newBalances.USC = '0'
      }

      setBalances(newBalances)
    } catch (error) {
      console.error('Error fetching currency balances:', error)
    } finally {
      setLoadingBalances(false)
    }
  }, [provider, address, isConnected])

  // Fetch balances when component mounts or address changes
  useEffect(() => {
    if (showBalances && isConnected) {
      fetchBalances()
    }
  }, [showBalances, isConnected, fetchBalances])

  const handleCurrencySelect = useCallback((currencyId) => {
    if (!disabled && onCurrencyChange) {
      onCurrencyChange(currencyId)
    }
    setIsExpanded(false)
  }, [disabled, onCurrencyChange])

  const toggleExpanded = useCallback(() => {
    if (!disabled) {
      setIsExpanded(prev => !prev)
    }
  }, [disabled])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (disabled) return

    switch (e.key) {
      case 'Escape':
        if (isExpanded) {
          setIsExpanded(false)
          e.preventDefault()
        }
        break
      case 'ArrowDown':
      case 'ArrowUp':
        if (isExpanded) {
          e.preventDefault()
          const options = Object.keys(CURRENCY_OPTIONS)
          const currentIndex = options.indexOf(selectedCurrency)
          const nextIndex = e.key === 'ArrowDown' 
            ? (currentIndex + 1) % options.length
            : (currentIndex - 1 + options.length) % options.length
          const newCurrency = options[nextIndex]
          if (onCurrencyChange) {
            onCurrencyChange(newCurrency)
          }
          setIsExpanded(false)
        }
        break
      case 'Enter':
      case ' ':
        if (!isExpanded) {
          setIsExpanded(true)
          e.preventDefault()
        }
        break
      default:
        break
    }
  }, [disabled, isExpanded, selectedCurrency, onCurrencyChange])

  // Format balance for display
  const formatBalance = (balance, decimals = 2) => {
    if (!balance || balance === '0') return '0.00'
    const num = parseFloat(balance)
    if (num < 0.01) return '<0.01'
    return num.toFixed(decimals)
  }

  return (
    <div className={`currency-selector ${className}`}>
      {/* Selected Currency Button */}
      <button
        type="button"
        className={`currency-selector-trigger ${isExpanded ? 'expanded' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-expanded={isExpanded}
        aria-haspopup="listbox"
        aria-label={`Selected currency: ${selectedOption.symbol}`}
      >
        <span className="currency-icon">{selectedOption.icon}</span>
        <span className="currency-symbol">{selectedOption.symbol}</span>
        {showBalances && balances[selectedOption.id] && (
          <span className="currency-balance">
            {loadingBalances ? '...' : formatBalance(balances[selectedOption.id])}
          </span>
        )}
        <svg
          className={`currency-chevron ${isExpanded ? 'rotated' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Currency Options Dropdown */}
      {isExpanded && (
        <div className="currency-dropdown" role="listbox">
          {Object.values(CURRENCY_OPTIONS).map((option) => (
            <button
              key={option.id}
              type="button"
              className={`currency-option ${selectedCurrency === option.id ? 'selected' : ''}`}
              onClick={() => handleCurrencySelect(option.id)}
              role="option"
              aria-selected={selectedCurrency === option.id}
            >
              <span className="currency-icon">{option.icon}</span>
              <div className="currency-info">
                <span className="currency-symbol">{option.symbol}</span>
                <span className="currency-name">{option.name}</span>
              </div>
              {showBalances && (
                <span className="currency-balance">
                  {loadingBalances ? '...' : formatBalance(balances[option.id])}
                </span>
              )}
              {option.isDefault && (
                <span className="currency-default-badge">Default</span>
              )}
              {selectedCurrency === option.id && (
                <svg
                  className="currency-check"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Backdrop to close dropdown */}
      {isExpanded && (
        <div
          className="currency-backdrop"
          onClick={() => setIsExpanded(false)}
          aria-hidden="true"
        />
      )}
    </div>
  )
}

/**
 * Helper function to get currency configuration by ID
 */
export const getCurrencyById = (currencyId) => {
  return CURRENCY_OPTIONS[currencyId] || CURRENCY_OPTIONS.USC
}

/**
 * Helper function to parse amount based on currency decimals
 */
export const parseAmountForCurrency = (amount, currencyId) => {
  const currency = getCurrencyById(currencyId)
  return ethers.parseUnits(amount.toString(), currency.decimals)
}

/**
 * Helper function to format amount based on currency decimals
 */
export const formatAmountForCurrency = (amount, currencyId) => {
  const currency = getCurrencyById(currencyId)
  return ethers.formatUnits(amount, currency.decimals)
}

export default CurrencySelector
