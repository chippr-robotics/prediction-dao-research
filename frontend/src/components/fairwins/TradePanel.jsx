import { useState, useEffect, useCallback } from 'react'
import { useDex } from '../../hooks/useDex'
import { SLIPPAGE_OPTIONS, getExplorerUrl } from '../../constants/dex'
import { feeTierLabel } from '../../lib/uniswap/trade'
import { useWallet } from '../../hooks'
import { useChainTokens } from '../../hooks/useChainTokens'
import './TradePanel.css'

const FROM_NATIVE = 'NATIVE'
const FROM_WNATIVE = 'WNATIVE'
const FROM_STABLE = 'STABLE'

// Price impact bands used to color the trade summary, mirroring the thresholds
// mainstream V3 clients use to warn a trader.
const IMPACT_WARN = 1 // %
const IMPACT_HIGH = 3 // %

function impactSeverity(pct) {
  if (pct == null) return 'unknown'
  if (pct >= IMPACT_HIGH) return 'high'
  if (pct >= IMPACT_WARN) return 'warn'
  return 'low'
}

function TradePanel() {
  const {
    balances,
    loading,
    quotingPrice,
    wrapNative,
    unwrapNative,
    swap,
    getBestQuote,
    slippage,
    setSlippage,
    addresses,
    isDexAvailable,
    dexProvider,
    network,
  } = useDex()

  const { isConnected, chainId } = useWallet()
  const { native: nativeSymbol, stable: stableSymbol } = useChainTokens()

  // Network-aware DEX provider identity (ETC family → ETCswap; else Uniswap).
  const providerName = dexProvider?.name || 'the DEX'
  const providerUrl = dexProvider?.url || null
  const networkName = network?.name || 'this network'
  // The trading engine is the Uniswap V3 protocol on every supported chain
  // (ETCswap is a V3 deployment). Name the chain's DEX first, then note the
  // protocol underneath — a subtle acknowledgement of the DeFi tool inside.
  const isUniswap = /uniswap/i.test(providerName)
  const poweredBy = isUniswap
    ? 'Powered by Uniswap v3'
    : `Powered by ${providerName} · Uniswap v3 protocol`

  const wnativeSymbol = nativeSymbol ? `W${nativeSymbol}` : 'WNATIVE'
  const labelFor = (key) => {
    if (key === FROM_NATIVE) return nativeSymbol
    if (key === FROM_WNATIVE) return wnativeSymbol
    return stableSymbol
  }

  const [mode, setMode] = useState('trade')
  const [fromToken, setFromToken] = useState(FROM_WNATIVE)
  const [toToken, setToToken] = useState(FROM_STABLE)
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState(null)
  const [wrapOutput, setWrapOutput] = useState('')
  const [rateInverted, setRateInverted] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const addrFor = useCallback(
    (key) => (key === FROM_WNATIVE ? addresses.WNATIVE : addresses.STABLECOIN),
    [addresses],
  )

  // Live quoting — debounced. Trade mode routes through the DEX; wrap/unwrap is
  // always 1:1 so we mirror the input.
  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0) {
      setQuote(null)
      setWrapOutput('')
      return
    }

    if (mode !== 'trade') {
      setWrapOutput(amount)
      setQuote(null)
      return
    }

    if (fromToken === toToken) {
      setQuote(null)
      return
    }

    let cancelled = false
    const timeoutId = setTimeout(async () => {
      try {
        const result = await getBestQuote(addrFor(fromToken), addrFor(toToken), amount)
        if (!cancelled) {
          setQuote(result)
          setError('')
        }
      } catch (err) {
        if (!cancelled) {
          setQuote(null)
          setError(err.message || 'Unable to price this trade')
        }
      }
    }, 450)

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [amount, fromToken, toToken, mode, getBestQuote, addrFor])

  const handleModeChange = (next) => {
    setMode(next)
    setAmount('')
    setQuote(null)
    setWrapOutput('')
    setError('')
    setSuccess('')

    if (next === 'wrap') {
      setFromToken(FROM_NATIVE)
      setToToken(FROM_WNATIVE)
    } else if (next === 'unwrap') {
      setFromToken(FROM_WNATIVE)
      setToToken(FROM_NATIVE)
    } else {
      setFromToken(FROM_WNATIVE)
      setToToken(FROM_STABLE)
    }
  }

  const handleFlipTokens = () => {
    setFromToken(toToken)
    setToToken(fromToken)
    setAmount('')
    setQuote(null)
    setError('')
  }

  const handleExecute = async () => {
    setError('')
    setSuccess('')

    if (!amount || parseFloat(amount) <= 0) {
      setError('Enter an amount to trade')
      return
    }

    try {
      if (mode === 'wrap') {
        await wrapNative(amount)
        setSuccess(`Wrapped ${amount} ${nativeSymbol} → ${wnativeSymbol}`)
      } else if (mode === 'unwrap') {
        await unwrapNative(amount)
        setSuccess(`Unwrapped ${amount} ${wnativeSymbol} → ${nativeSymbol}`)
      } else {
        await swap(addrFor(fromToken), addrFor(toToken), amount)
        setSuccess(`Swapped ${amount} ${labelFor(fromToken)} → ${labelFor(toToken)}`)
      }
      setAmount('')
      setQuote(null)
      setWrapOutput('')
    } catch (err) {
      console.error('Trade error:', err)
      setError(err.message || 'Transaction failed')
    }
  }

  const balanceFor = (key) => {
    if (key === FROM_NATIVE) return balances.native
    if (key === FROM_WNATIVE) return balances.wnative
    return balances.stable
  }

  const handleSetMax = () => {
    if (fromToken === FROM_NATIVE) {
      // Leave a little native for gas.
      const maxAmount = Math.max(0, parseFloat(balances.native) - 0.01)
      setAmount(maxAmount.toString())
    } else {
      setAmount(balanceFor(fromToken))
    }
  }

  if (!isConnected) {
    return (
      <div className="trade-panel">
        <div className="trade-header">
          <h2>Trade</h2>
          <p className="trade-subtitle">Swap, wrap and unwrap on {networkName}</p>
        </div>
        <div className="trade-empty">
          <p>Connect your wallet to start trading.</p>
        </div>
      </div>
    )
  }

  if (!isDexAvailable) {
    return (
      <div className="trade-panel">
        <div className="trade-header">
          <h2>Trade</h2>
          <p className="trade-subtitle">Trading is unavailable on {networkName}</p>
        </div>
        <div className="trade-empty">
          <p>
            {dexProvider
              ? `${providerName} is not configured on ${networkName}. Switch to a supported network to trade in-app.`
              : `No DEX is configured on ${networkName}. Switch to a supported network to trade in-app.`}
          </p>
        </div>
      </div>
    )
  }

  const isTrade = mode === 'trade'
  const receiveValue = isTrade
    ? quotingPrice
      ? '…'
      : quote?.amountOut
        ? Number(quote.amountOut).toLocaleString(undefined, { maximumSignificantDigits: 8 })
        : '0.0'
    : wrapOutput || '0.0'

  const severity = impactSeverity(quote?.priceImpactPercent)
  const canExecute =
    !loading && amount && parseFloat(amount) > 0 && (!isTrade || Boolean(quote))

  const rateLabel =
    quote && !rateInverted
      ? `1 ${quote.tokenInSymbol} = ${quote.executionPrice} ${quote.tokenOutSymbol}`
      : quote
        ? `1 ${quote.tokenOutSymbol} = ${quote.executionPriceInverted} ${quote.tokenInSymbol}`
        : null

  return (
    <div className="trade-panel">
      <div className="trade-header">
        <div className="trade-title-row">
          <h2>Trade</h2>
          <span className="trade-venue" title={`Routing via ${providerName}`}>
            {providerName}
          </span>
        </div>
        <p className="trade-subtitle">
          Best-execution swaps routed across {providerName} liquidity
        </p>
      </div>

      <div className="trade-modes" role="tablist" aria-label="Trade mode">
        <button
          role="tab"
          aria-selected={mode === 'trade'}
          className={`trade-mode-btn ${mode === 'trade' ? 'active' : ''}`}
          onClick={() => handleModeChange('trade')}
        >
          Swap
        </button>
        <button
          role="tab"
          aria-selected={mode === 'wrap'}
          className={`trade-mode-btn ${mode === 'wrap' ? 'active' : ''}`}
          onClick={() => handleModeChange('wrap')}
        >
          Wrap
        </button>
        <button
          role="tab"
          aria-selected={mode === 'unwrap'}
          className={`trade-mode-btn ${mode === 'unwrap' ? 'active' : ''}`}
          onClick={() => handleModeChange('unwrap')}
        >
          Unwrap
        </button>
      </div>

      <div className="trade-ticket">
        {/* Pay leg */}
        <div className="trade-leg">
          <div className="trade-leg-top">
            <label htmlFor="trade-amount">You pay</label>
            <span className="trade-balance">
              Balance: {Number(balanceFor(fromToken)).toLocaleString(undefined, { maximumSignificantDigits: 8 })}
            </span>
          </div>
          <div className="trade-leg-body">
            <input
              id="trade-amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              step="0.000001"
              min="0"
              inputMode="decimal"
              className="trade-amount-input"
            />
            {isTrade ? (
              <select
                aria-label="Token to sell"
                value={fromToken}
                onChange={(e) => setFromToken(e.target.value)}
                className="trade-token-select"
              >
                <option value={FROM_WNATIVE}>{wnativeSymbol}</option>
                <option value={FROM_STABLE}>{stableSymbol}</option>
              </select>
            ) : (
              <span className="trade-token-static">{labelFor(fromToken)}</span>
            )}
            <button type="button" onClick={handleSetMax} className="trade-max-btn">
              MAX
            </button>
          </div>
        </div>

        <div className="trade-switch-row">
          {isTrade ? (
            <button
              type="button"
              onClick={handleFlipTokens}
              className="trade-switch-btn"
              aria-label="Switch direction"
            >
              ↓↑
            </button>
          ) : (
            <span className="trade-switch-static" aria-hidden="true">↓</span>
          )}
        </div>

        {/* Receive leg */}
        <div className="trade-leg">
          <div className="trade-leg-top">
            <label>You receive</label>
            <span className="trade-balance">
              Balance: {Number(balanceFor(toToken)).toLocaleString(undefined, { maximumSignificantDigits: 8 })}
            </span>
          </div>
          <div className="trade-leg-body">
            <div className="trade-receive-value" aria-live="polite">
              {receiveValue}
            </div>
            {isTrade ? (
              <select
                aria-label="Token to buy"
                value={toToken}
                onChange={(e) => setToToken(e.target.value)}
                className="trade-token-select"
              >
                <option value={FROM_WNATIVE}>{wnativeSymbol}</option>
                <option value={FROM_STABLE}>{stableSymbol}</option>
              </select>
            ) : (
              <span className="trade-token-static">{labelFor(toToken)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Trade summary — the capital-markets read-out */}
      {isTrade && quote && (
        <div className="trade-summary" role="group" aria-label="Trade details">
          <button
            type="button"
            className="trade-summary-row trade-rate"
            onClick={() => setRateInverted((v) => !v)}
            title="Tap to invert"
          >
            <span className="trade-summary-key">Rate</span>
            <span className="trade-summary-val">{rateLabel} ⇄</span>
          </button>
          <div className="trade-summary-row">
            <span className="trade-summary-key">Price impact</span>
            <span className={`trade-summary-val impact-${severity}`}>
              {quote.priceImpactPercent == null
                ? '—'
                : quote.priceImpactPercent < 0.01
                  ? '<0.01%'
                  : `${quote.priceImpactPercent.toFixed(2)}%`}
            </span>
          </div>
          <div className="trade-summary-row">
            <span className="trade-summary-key">
              Minimum received
              <span className="trade-summary-note"> after {(slippage / 100).toFixed(2)}% slippage</span>
            </span>
            <span className="trade-summary-val">
              {Number(quote.minimumReceived).toLocaleString(undefined, { maximumSignificantDigits: 8 })}{' '}
              {quote.tokenOutSymbol}
            </span>
          </div>
          <div className="trade-summary-row">
            <span className="trade-summary-key">Route</span>
            <span className="trade-summary-val trade-route">
              {quote.tokenInSymbol} → {quote.tokenOutSymbol}
              <span className="trade-route-fee">{feeTierLabel(quote.feeTier)} pool</span>
            </span>
          </div>
          <div className="trade-summary-row trade-slippage">
            <label htmlFor="trade-slippage-select" className="trade-summary-key">
              Slippage tolerance
            </label>
            <select
              id="trade-slippage-select"
              value={slippage}
              onChange={(e) => setSlippage(parseInt(e.target.value))}
              className="trade-slippage-select"
            >
              {SLIPPAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {isTrade && severity === 'high' && (
        <div className="trade-impact-warning" role="alert">
          High price impact — you may receive substantially less than the market rate.
        </div>
      )}

      <button
        type="button"
        onClick={handleExecute}
        disabled={!canExecute}
        className="trade-execute-btn"
      >
        {loading
          ? 'Processing…'
          : mode === 'wrap'
            ? `Wrap ${nativeSymbol}`
            : mode === 'unwrap'
              ? `Unwrap ${wnativeSymbol}`
              : quotingPrice
                ? 'Fetching best price…'
                : quote
                  ? `Swap ${labelFor(fromToken)} for ${labelFor(toToken)}`
                  : 'Enter an amount'}
      </button>

      {error && (
        <div className="trade-message trade-error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="trade-message trade-success" role="status">
          {success}
        </div>
      )}

      <div className="trade-footer">
        <div className="trade-attribution" title={`${providerName} — Uniswap V3 protocol`}>
          <span className="trade-attribution-dot" aria-hidden="true" />
          {poweredBy}
        </div>
        <div className="trade-links">
          <a
            href={getExplorerUrl(chainId, addresses.SWAP_ROUTER_02, 'address')}
            target="_blank"
            rel="noopener noreferrer"
            className="trade-link"
          >
            {providerName} Router ↗
          </a>
          {providerUrl && (
            <a href={providerUrl} target="_blank" rel="noopener noreferrer" className="trade-link">
              Open {providerName} ↗
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default TradePanel
