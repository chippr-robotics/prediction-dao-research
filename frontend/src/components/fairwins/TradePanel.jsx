import { useState, useEffect, useCallback, useMemo } from 'react'
import { parseUnits } from 'ethers'
import { useDex } from '../../hooks/useDex'
import {
  SLIPPAGE_OPTIONS,
  PRICE_TYPES,
  SPOT_ORDER_TYPES,
  PERPS_ORDER_TYPES,
  getPerpsVenue,
  getExplorerUrl,
} from '../../constants/dex'
import { feeTierLabel } from '../../lib/uniswap/trade'
import { useWallet } from '../../hooks'
import { useChainTokens } from '../../hooks/useChainTokens'
import { useActiveAccount } from '../../hooks/useActiveAccount'
import { useCustodyVaults } from '../../hooks/useCustodyVaults'
import SensitiveValue from '../common/SensitiveValue'
import InfoTip from '../ui/InfoTip'
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

const shortAddress = (addr) =>
  addr && addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr || ''

const fmtBalance = (value) =>
  Number(value || 0).toLocaleString(undefined, { maximumSignificantDigits: 8 })

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
    tokens,
    isDexAvailable,
    dexProvider,
    network,
  } = useDex()

  const { isConnected, chainId, address, loginMethod } = useWallet()
  const { native: nativeSymbol, stable: stableSymbol } = useChainTokens()

  // Account selection (spec 043): trade as the personal wallet or as one of the
  // member's saved multisig vaults. Selecting a vault turns every order into a
  // threshold-gated proposal; balances shown below always follow the selection.
  const { identity, isVault, operateAsVault, operateAsPersonal } = useActiveAccount()
  const { vaults } = useCustodyVaults()

  // Session rails: passkey accounts transact through their smart account —
  // gasless (FairWins-sponsored) where the network has a sponsor paymaster
  // (spec 050), self-funded otherwise. Classic wallets pay network fees.
  const isPasskey = loginMethod === 'passkey'
  const passkeyReady = !isPasskey || Boolean(network?.passkey)
  const passkeySponsored = isPasskey && Boolean(network?.passkey?.sponsorPaymasterUrl)

  // Perpetuals order types only exist where the network has a perps venue.
  // No supported network configures one yet, so these stay off — honest-state.
  const perpsVenue = getPerpsVenue(network)

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
  const [orderType, setOrderType] = useState('sell')
  const [priceType, setPriceType] = useState('market')
  const [limitPrice, setLimitPrice] = useState('')
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

  const isPerpsOrder = orderType === 'sell_short' || orderType === 'buy_to_cover'

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

    if (fromToken === toToken || isPerpsOrder) {
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
  }, [amount, fromToken, toToken, mode, isPerpsOrder, getBestQuote, addrFor])

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
      setOrderType('sell')
    }
  }

  // Spot order type maps onto the pair direction: Buy receives the network
  // asset, Sell pays it away. The two stay in sync in both directions.
  const deriveOrderType = (from, to) => {
    if (to === FROM_WNATIVE && from === FROM_STABLE) return 'buy'
    if (from === FROM_WNATIVE && to === FROM_STABLE) return 'sell'
    return null
  }

  const handleOrderTypeChange = (next) => {
    setOrderType(next)
    setQuote(null)
    setError('')
    setSuccess('')
    if (next === 'buy') {
      setFromToken(FROM_STABLE)
      setToToken(FROM_WNATIVE)
    } else if (next === 'sell') {
      setFromToken(FROM_WNATIVE)
      setToToken(FROM_STABLE)
    }
  }

  const handlePairChange = (side, value) => {
    const from = side === 'from' ? value : fromToken
    const to = side === 'to' ? value : toToken
    if (side === 'from') setFromToken(value)
    else setToToken(value)
    const derived = deriveOrderType(from, to)
    if (derived) setOrderType(derived)
    setQuote(null)
    setError('')
  }

  const handleFlipTokens = () => {
    const derived = deriveOrderType(toToken, fromToken)
    setFromToken(toToken)
    setToToken(fromToken)
    if (derived) setOrderType(derived)
    setAmount('')
    setQuote(null)
    setError('')
  }

  const handleAccountChange = (value) => {
    setSuccess('')
    setError('')
    if (value === 'personal') {
      operateAsPersonal()
      return
    }
    const vault = vaults.find((v) => v.address === value)
    if (vault) operateAsVault(vault)
  }

  // A Limit order's floor: limit price (output per 1 unit paid) × quantity,
  // enforced on-chain as the swap's minimum received.
  const outDecimals =
    toToken === FROM_STABLE ? tokens?.STABLE?.decimals ?? 6 : 18
  const limitFloor = useMemo(() => {
    if (priceType !== 'limit') return null
    const qty = parseFloat(amount)
    const px = parseFloat(limitPrice)
    if (!Number.isFinite(qty) || !Number.isFinite(px) || qty <= 0 || px <= 0) return null
    const text = (qty * px).toFixed(outDecimals)
    try {
      return { wei: parseUnits(text, outDecimals), text }
    } catch {
      return null
    }
  }, [priceType, amount, limitPrice, outDecimals])

  const handleExecute = async () => {
    setError('')
    setSuccess('')

    if (!amount || parseFloat(amount) <= 0) {
      setError('Enter an amount to trade')
      return
    }
    if (mode === 'trade' && priceType === 'limit' && !limitFloor) {
      setError('Enter a limit price to place a limit order')
      return
    }

    try {
      const proposedNote = `Proposed to ${identity.label || 'the multisig'} — owners approve before it executes.`
      if (mode === 'wrap') {
        const res = await wrapNative(amount)
        setSuccess(
          res?.proposed
            ? proposedNote
            : `Wrapped ${amount} ${nativeSymbol} → ${wnativeSymbol}`,
        )
      } else if (mode === 'unwrap') {
        const res = await unwrapNative(amount)
        setSuccess(
          res?.proposed
            ? proposedNote
            : `Unwrapped ${amount} ${wnativeSymbol} → ${nativeSymbol}`,
        )
      } else {
        const res =
          priceType === 'limit'
            ? await swap(addrFor(fromToken), addrFor(toToken), amount, {
                limitMinOutWei: limitFloor.wei,
              })
            : await swap(addrFor(fromToken), addrFor(toToken), amount)
        setSuccess(
          res?.proposed
            ? proposedNote
            : `Swapped ${amount} ${labelFor(fromToken)} → ${labelFor(toToken)}`,
        )
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
    !loading &&
    passkeyReady &&
    !isPerpsOrder &&
    amount &&
    parseFloat(amount) > 0 &&
    (!isTrade || Boolean(quote)) &&
    (!isTrade || priceType !== 'limit' || Boolean(limitFloor))

  const rateLabel =
    quote && !rateInverted
      ? `1 ${quote.tokenInSymbol} = ${quote.executionPrice} ${quote.tokenOutSymbol}`
      : quote
        ? `1 ${quote.tokenOutSymbol} = ${quote.executionPriceInverted} ${quote.tokenInSymbol}`
        : null

  const accountValue = isVault ? identity.vaultAddress : 'personal'
  const feeBadge = isVault
    ? { className: 'trade-badge-proposal', text: 'Multisig proposal' }
    : passkeySponsored
      ? { className: 'trade-badge-gasless', text: '⚡ Gasless · sponsored' }
      : { className: 'trade-badge-fee', text: 'Network fee applies' }

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

      {/* Account — the personal wallet or a saved multisig; the available
          figures below always belong to the selected account. */}
      <section className="trade-account" aria-label="Trading account">
        <div className="trade-account-top">
          <label className="trade-field-label" htmlFor="trade-account-select">
            Account
          </label>
          <span className={`trade-badge ${feeBadge.className}`}>{feeBadge.text}</span>
        </div>
        <select
          id="trade-account-select"
          className="trade-account-select"
          value={accountValue}
          onChange={(e) => handleAccountChange(e.target.value)}
        >
          <option value="personal">
            Personal wallet{address ? ` · ${shortAddress(address)}` : ''}
          </option>
          {vaults.map((v) => (
            <option key={v.address} value={v.address}>
              {(v.label || shortAddress(v.address)) + ' · Multisig'}
            </option>
          ))}
        </select>
        <dl className="trade-account-rows">
          <div className="trade-account-row">
            <dt>Available to trade ({labelFor(fromToken)})</dt>
            <dd>
              <SensitiveValue>{fmtBalance(balanceFor(fromToken))}</SensitiveValue>
            </dd>
          </div>
          <div className="trade-account-row">
            <dt>Cash available ({stableSymbol})</dt>
            <dd>
              <SensitiveValue>{fmtBalance(balances.stable)}</SensitiveValue>
            </dd>
          </div>
        </dl>
        {isVault && (
          <p className="trade-account-note">
            Orders from this account are proposed to the multisig and execute once enough
            owners approve.
          </p>
        )}
        {!passkeyReady && (
          <p className="trade-account-note" role="note">
            Passkey accounts can’t send transactions on {networkName} yet — connect a
            browser wallet to trade here.
          </p>
        )}
      </section>

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

      {/* Order ticket controls — order type, price type, term (brokerage-style). */}
      {isTrade && (
        <div className="trade-order-grid">
          <div className="trade-field">
            <span className="trade-field-label">
              <label htmlFor="trade-order-type">Order Type</label>
              <InfoTip label="About order types" className="trade-info">
                Buy receives {wnativeSymbol} for {stableSymbol}; Sell does the reverse.
                Sell Short and Buy to Cover appear on networks with a perpetuals venue —
                {perpsVenue ? ` ${perpsVenue.name} on this network.` : ' none of the supported networks has one yet.'}
              </InfoTip>
            </span>
            <select
              id="trade-order-type"
              className="trade-field-select"
              value={orderType}
              onChange={(e) => handleOrderTypeChange(e.target.value)}
            >
              {SPOT_ORDER_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              {perpsVenue &&
                PERPS_ORDER_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </select>
          </div>

          <div className="trade-field">
            <span className="trade-field-label">
              <label htmlFor="trade-price-type">Price Type</label>
              <InfoTip label="About price types" className="trade-info">
                Market fills at the best routed price within your slippage tolerance.
                Limit fills at your price or better, or not at all — orders don’t rest
                on a book.
              </InfoTip>
            </span>
            <select
              id="trade-price-type"
              className="trade-field-select"
              value={priceType}
              onChange={(e) => {
                setPriceType(e.target.value)
                setError('')
              }}
            >
              {PRICE_TYPES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {priceType === 'limit' && (
            <div className="trade-field">
              <label className="trade-field-label" htmlFor="trade-limit-price">
                Limit Price ({labelFor(toToken)} per {labelFor(fromToken)})
              </label>
              <input
                id="trade-limit-price"
                className="trade-field-input"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.000001"
                placeholder="0.0"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
              />
            </div>
          )}

          <div className="trade-field">
            <span className="trade-field-label">Term</span>
            <span className="trade-field-static">
              {priceType === 'limit' ? 'Fill at limit or cancel' : 'Immediate'}
            </span>
          </div>
        </div>
      )}

      {isTrade && isPerpsOrder && (
        <div className="trade-message trade-error" role="alert">
          {perpsVenue
            ? `${orderType === 'sell_short' ? 'Sell Short' : 'Buy to Cover'} orders route to ${perpsVenue.name}, which isn’t wired into in-app execution yet.`
            : `Short selling needs a perpetuals venue, and ${networkName} doesn’t have one yet.`}
        </div>
      )}

      <div className="trade-ticket">
        {/* Pay leg */}
        <div className="trade-leg">
          <div className="trade-leg-top">
            <label htmlFor="trade-amount">You pay</label>
            <span className="trade-balance">
              Balance: <SensitiveValue>{fmtBalance(balanceFor(fromToken))}</SensitiveValue>
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
                onChange={(e) => handlePairChange('from', e.target.value)}
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
              Balance: <SensitiveValue>{fmtBalance(balanceFor(toToken))}</SensitiveValue>
            </span>
          </div>
          <div className="trade-leg-body">
            <div className="trade-receive-value" aria-live="polite">
              <SensitiveValue>{receiveValue}</SensitiveValue>
            </div>
            {isTrade ? (
              <select
                aria-label="Token to buy"
                value={toToken}
                onChange={(e) => handlePairChange('to', e.target.value)}
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
              {priceType === 'limit' ? (
                <span className="trade-summary-note"> at your limit price</span>
              ) : (
                <span className="trade-summary-note"> after {(slippage / 100).toFixed(2)}% slippage</span>
              )}
            </span>
            <span className="trade-summary-val">
              <SensitiveValue>
                {priceType === 'limit' && limitFloor
                  ? fmtBalance(limitFloor.text)
                  : fmtBalance(quote.minimumReceived)}
              </SensitiveValue>{' '}
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
          {priceType !== 'limit' && (
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
          )}
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
                  ? priceType === 'limit'
                    ? `Place limit order — ${labelFor(fromToken)} for ${labelFor(toToken)}`
                    : `Swap ${labelFor(fromToken)} for ${labelFor(toToken)}`
                  : 'Enter an amount'}
      </button>

      {isPasskey && passkeyReady && !isVault && (
        <p className="trade-session-note">
          One passkey confirmation covers the whole order — including the spending
          permission when it’s needed.
          {passkeySponsored ? ' FairWins sponsors the network fee.' : ''}
        </p>
      )}

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
