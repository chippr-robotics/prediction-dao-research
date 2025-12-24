import { useState, useEffect, useCallback } from 'react'

/**
 * Hook to fetch and manage ETC/USD exchange rate
 * Uses CoinGecko public API for price data
 */
function usePriceConversion() {
  const [etcUsdRate, setEtcUsdRate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showUsd, setShowUsd] = useState(true) // USD is default
  const [lastUpdate, setLastUpdate] = useState(null)

  const fetchEtcPrice = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Using CoinGecko API (free, no API key required)
      // ETC ID on CoinGecko is 'ethereum-classic'
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum-classic&vs_currencies=usd',
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        }
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch price: ${response.status}`)
      }

      const data = await response.json()
      
      if (data['ethereum-classic'] && data['ethereum-classic'].usd) {
        setEtcUsdRate(data['ethereum-classic'].usd)
        setLastUpdate(new Date())
      } else {
        throw new Error('Invalid response format')
      }
    } catch (err) {
      console.error('Error fetching ETC price:', err)
      setError(err.message)
      // Set a fallback rate if fetch fails (approximate historical average)
      // In production, consider using environment variable or cached value
      setEtcUsdRate(process.env.VITE_ETC_USD_FALLBACK || 20)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial fetch
    fetchEtcPrice()

    // Refresh every 60 seconds
    const interval = setInterval(fetchEtcPrice, 60000)

    return () => clearInterval(interval)
  }, [fetchEtcPrice])

  const toggleCurrency = useCallback(() => {
    setShowUsd((prev) => !prev)
  }, [])

  const convertToUsd = useCallback((etcAmount) => {
    if (!etcUsdRate || etcAmount == null) return 0
    return parseFloat(etcAmount) * etcUsdRate
  }, [etcUsdRate])

  const formatPrice = useCallback((etcAmount, options = {}) => {
    const {
      showBoth = false,
      decimals = 2,
      compact = false
    } = options

    const amount = parseFloat(etcAmount) || 0
    const usdAmount = convertToUsd(amount)

    // Format USD with compact notation for large numbers
    const formatUsd = (value) => {
      if (compact && value >= 1000000) {
        return `$${(value / 1000000).toFixed(2)}M`
      }
      if (compact && value >= 1000) {
        return `$${(value / 1000).toFixed(1)}K`
      }
      return `$${value.toFixed(decimals)}`
    }

    // Format ETC
    const formatEtc = (value) => {
      if (compact && value >= 1000) {
        return `${(value / 1000).toFixed(1)}K ETC`
      }
      return `${value.toFixed(decimals)} ETC`
    }

    if (showBoth) {
      // Show both currencies
      if (showUsd) {
        return `${formatUsd(usdAmount)} (${formatEtc(amount)})`
      } else {
        return `${formatEtc(amount)} (${formatUsd(usdAmount)})`
      }
    } else {
      // Show only the selected currency
      return showUsd ? formatUsd(usdAmount) : formatEtc(amount)
    }
  }, [convertToUsd, showUsd])

  return {
    etcUsdRate,
    loading,
    error,
    showUsd,
    toggleCurrency,
    convertToUsd,
    formatPrice,
    lastUpdate,
    refreshPrice: fetchEtcPrice
  }
}

export default usePriceConversion
