import { useState, useEffect, useCallback } from 'react'
import logger from '../utils/logger'

/**
 * Hook to fetch and manage MATIC/USD exchange rate.
 *
 * Polygon Amoy is the only supported testnet, so the native token tracked
 * here is MATIC. Uses CoinGecko's public API; falls back to
 * VITE_MATIC_USD_FALLBACK (or 0.5) when the request fails.
 */
function usePriceConversion() {
  const [nativeUsdRate, setNativeUsdRate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showUsd, setShowUsd] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)

  const fetchNativePrice = useCallback(async () => {
    if (import.meta.env.VITE_SKIP_BLOCKCHAIN_CALLS === 'true') {
      setNativeUsdRate(0.5)
      setLoading(false)
      setLastUpdate(new Date())
      return
    }

    try {
      setLoading(true)
      setError(null)

      // MATIC's CoinGecko ID is 'matic-network'.
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=matic-network&vs_currencies=usd',
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

      if (data['matic-network'] && data['matic-network'].usd) {
        setNativeUsdRate(data['matic-network'].usd)
        setLastUpdate(new Date())
      } else {
        throw new Error('Invalid response format')
      }
    } catch (err) {
      logger.error('Error fetching MATIC price:', err)
      setError(err.message)
      const fallbackRate = import.meta.env.VITE_MATIC_USD_FALLBACK || 0.5
      setNativeUsdRate(fallbackRate)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNativePrice()
    // Refresh every 5 minutes to stay polite with the public CoinGecko API.
    const interval = setInterval(fetchNativePrice, 300000)
    return () => clearInterval(interval)
  }, [fetchNativePrice])

  const toggleCurrency = useCallback(() => {
    setShowUsd((prev) => !prev)
  }, [])

  const convertToUsd = useCallback((nativeAmount) => {
    if (!nativeUsdRate || nativeAmount == null) return 0
    return parseFloat(nativeAmount) * nativeUsdRate
  }, [nativeUsdRate])

  const formatPrice = useCallback((nativeAmount, options = {}) => {
    const {
      showBoth = false,
      decimals = 2,
      compact = false,
      symbol = 'MATIC',
    } = options

    const amount = parseFloat(nativeAmount) || 0
    const usdAmount = convertToUsd(amount)

    const formatUsd = (value) => {
      if (compact && value >= 1000000) {
        return `$${(value / 1000000).toFixed(2)}M`
      }
      if (compact && value >= 1000) {
        return `$${(value / 1000).toFixed(1)}K`
      }
      return `$${value.toFixed(decimals)}`
    }

    const formatNative = (value) => {
      if (compact && value >= 1000) {
        return `${(value / 1000).toFixed(1)}K ${symbol}`
      }
      return `${value.toFixed(decimals)} ${symbol}`
    }

    if (showBoth) {
      if (showUsd) {
        return `${formatUsd(usdAmount)} (${formatNative(amount)})`
      } else {
        return `${formatNative(amount)} (${formatUsd(usdAmount)})`
      }
    } else {
      return showUsd ? formatUsd(usdAmount) : formatNative(amount)
    }
  }, [convertToUsd, showUsd])

  return {
    // Back-compat alias: many callers still destructure `etcUsdRate`.
    etcUsdRate: nativeUsdRate,
    nativeUsdRate,
    loading,
    error,
    showUsd,
    toggleCurrency,
    convertToUsd,
    formatPrice,
    lastUpdate,
    refreshPrice: fetchNativePrice
  }
}

export default usePriceConversion
