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
import { useLegacyAccounts } from '../../hooks/useLegacyAccounts'
import LegacyUnlockDialog from '../account/LegacyUnlockDialog'
import SensitiveValue from '../common/SensitiveValue'
import InfoTip from '../ui/InfoTip'
import './TradePanel.css'

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

const sameAddr = (a, b) => Boolean(a) && Boolean(b) && a.toLowerCase() === b.toLowerCase()

function TradePanel() {
  const {
    balances,
    loading,
    quotingPrice,
    swap,
    getBestQuote,
    slippage,
    setSlippage,
    addresses,
    tradeTokens,
    isDexAvailable,
    dexProvider,
    network,
  } = useDex()

  const { isConnected, chainId, address, loginMethod } = useWallet()
  const { native: nativeSymbol, stable: stableSymbol } = useChainTokens()

  // Account selection (spec 043 + 062): trade as the personal wallet, one of the
  // member's saved multisig vaults, or a recovered legacy account. A vault turns
  // every order into a threshold-gated proposal; a recovered account signs each
  // order with its unlocked in-memory key. Balances always follow the selection.
  const { identity, isVault, isLegacy, operateAsVault, operateAsPersonal, operateAsLegacy } =
    useActiveAccount()
  const { vaults } = useCustodyVaults()
  const legacyAccounts = useLegacyAccounts()
  const [unlockEntry, setUnlockEntry] = useState(null)

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

  // The tradeable set for the active chain (wrapped-native, the stablecoin, and
  // every curated portfolio asset with a routeable pair here). Keyed by address.
  const assets = useMemo(() => tradeTokens || [], [tradeTokens])
  const tokenFor = useCallback(
    (addr) => assets.find((t) => sameAddr(t.address, addr)) || null,
    [assets],
  )
  const symbolFor = useCallback((addr) => tokenFor(addr)?.symbol || '—', [tokenFor])
  const balanceFor = useCallback(
    (addr) => balances.tokens?.[addr?.toLowerCase?.()] ?? '0',
    [balances],
  )

  const [fromToken, setFromToken] = useState(addresses.WNATIVE)
  const [toToken, setToToken] = useState(addresses.STABLECOIN)
  // Re-seed the pair to the chain default (sell wrapped-native for the
  // stablecoin) whenever the active chain changes, without an effect: adjust
  // state during render keyed on the chain's core addresses (React-endorsed),
  // so a mid-chain token pick is never clobbered by a re-render.
  const [chainKey, setChainKey] = useState(addresses.WNATIVE)
  if (chainKey !== addresses.WNATIVE) {
    setChainKey(addresses.WNATIVE)
    setFromToken(addresses.WNATIVE)
    setToToken(addresses.STABLECOIN)
  }
  const [orderType, setOrderType] = useState('sell')
  const [priceType, setPriceType] = useState('market')
  const [limitPrice, setLimitPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState(null)
  const [rateInverted, setRateInverted] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const isPerpsOrder = orderType === 'sell_short' || orderType === 'buy_to_cover'

  // Live quoting — debounced. Routes through the DEX for the selected pair.
  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0) {
      setQuote(null)
      return
    }

    if (!fromToken || !toToken || sameAddr(fromToken, toToken) || isPerpsOrder) {
      setQuote(null)
      return
    }

    let cancelled = false
    const timeoutId = setTimeout(async () => {
      try {
        const result = await getBestQuote(fromToken, toToken, amount)
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
  }, [amount, fromToken, toToken, isPerpsOrder, getBestQuote])

  // Spot order type maps onto the pair direction relative to cash: paying the
  // stablecoin to receive an asset is a Buy; paying an asset for the stablecoin
  // is a Sell. Asset-for-asset pairs leave the order type unchanged.
  const deriveOrderType = (from, to) => {
    const stable = addresses.STABLECOIN
    if (sameAddr(to, stable) && !sameAddr(from, stable)) return 'sell'
    if (sameAddr(from, stable) && !sameAddr(to, stable)) return 'buy'
    return null
  }

  const handleOrderTypeChange = (next) => {
    setOrderType(next)
    setQuote(null)
    setError('')
    setSuccess('')
    if (next === 'buy') {
      setFromToken(addresses.STABLECOIN)
      setToToken(addresses.WNATIVE)
    } else if (next === 'sell') {
      setFromToken(addresses.WNATIVE)
      setToToken(addresses.STABLECOIN)
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
    if (value.startsWith('legacy:')) {
      // Unlock (biometric/passphrase) before acting; operateAsLegacy on success.
      const acct = legacyAccounts.find((a) => a.id === value)
      if (acct) setUnlockEntry(acct.entry)
      return
    }
    const vault = vaults.find((v) => v.address === value)
    if (vault) operateAsVault(vault)
  }

  const handleLegacyUnlocked = (signer) => {
    if (unlockEntry) {
      operateAsLegacy({
        address: unlockEntry.address,
        chainId,
        kind: unlockEntry.kind,
        label: shortAddress(unlockEntry.address),
        signer,
      })
    }
    setUnlockEntry(null)
  }

  // A Limit order's floor: limit price (output per 1 unit paid) × quantity,
  // enforced on-chain as the swap's minimum received.
  const outDecimals = tokenFor(toToken)?.decimals ?? 18
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
    if (priceType === 'limit' && !limitFloor) {
      setError('Enter a limit price to place a limit order')
      return
    }

    try {
      const proposedNote = `Proposed to ${identity.label || 'the multisig'} — owners approve before it executes.`
      const res =
        priceType === 'limit'
          ? await swap(fromToken, toToken, amount, { limitMinOutWei: limitFloor.wei })
          : await swap(fromToken, toToken, amount)
      setSuccess(
        res?.proposed
          ? proposedNote
          : `Swapped ${amount} ${symbolFor(fromToken)} → ${symbolFor(toToken)}`,
      )
      setAmount('')
      setQuote(null)
    } catch (err) {
      console.error('Trade error:', err)
      setError(err.message || 'Transaction failed')
    }
  }

  const handleSetMax = () => {
    setAmount(balanceFor(fromToken))
  }

  if (!isConnected) {
    return (
      <div className="trade-panel">
        <div className="trade-header">
          <h2>Trade</h2>
          <p className="trade-subtitle">Trade on {networkName}</p>
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

  const receiveValue = quotingPrice
    ? '…'
    : quote?.amountOut
      ? Number(quote.amountOut).toLocaleString(undefined, { maximumSignificantDigits: 8 })
      : '0.0'

  const severity = impactSeverity(quote?.priceImpactPercent)
  const canExecute =
    !loading &&
    // A recovered account signs with its own EOA key, not the passkey rail, so
    // passkey readiness doesn't gate it.
    (passkeyReady || isLegacy) &&
    !isPerpsOrder &&
    amount &&
    parseFloat(amount) > 0 &&
    Boolean(quote) &&
    (priceType !== 'limit' || Boolean(limitFloor))

  const rateLabel =
    quote && !rateInverted
      ? `1 ${quote.tokenInSymbol} = ${quote.executionPrice} ${quote.tokenOutSymbol}`
      : quote
        ? `1 ${quote.tokenOutSymbol} = ${quote.executionPriceInverted} ${quote.tokenInSymbol}`
        : null

  const accountValue = isVault
    ? identity.vaultAddress
    : identity.mode === 'legacy' && identity.address
      ? `legacy:${String(identity.address).toLowerCase()}`
      : 'personal'
  const feeBadge = isVault
    ? { className: 'trade-badge-proposal', text: 'Multisig proposal' }
    : isLegacy
      ? { className: 'trade-badge-fee', text: 'Network fee applies' }
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
          {legacyAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {(a.label || shortAddress(a.address)) + ' · Recovered'}
            </option>
          ))}
        </select>
        <LegacyUnlockDialog
          open={Boolean(unlockEntry)}
          entry={unlockEntry}
          onClose={() => setUnlockEntry(null)}
          onUnlocked={handleLegacyUnlocked}
        />
        {isLegacy && (
          <p className="trade-account-note" role="note">
            Orders sign with your recovered account&apos;s key on {networkName}. You pay the
            network fee — recovered accounts aren&apos;t gasless.
          </p>
        )}
        <dl className="trade-account-rows">
          <div className="trade-account-row">
            <dt>Available to trade ({symbolFor(fromToken)})</dt>
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
        {!passkeyReady && !isLegacy && (
          <p className="trade-account-note" role="note">
            Passkey accounts can’t send transactions on {networkName} yet — connect a
            browser wallet to trade here.
          </p>
        )}
      </section>

      {/* Order ticket controls — order type + price type share a row, with the
          limit price / term beneath (brokerage-style). */}
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
              Limit Price ({symbolFor(toToken)} per {symbolFor(fromToken)})
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

      {isPerpsOrder && (
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
            <select
              aria-label="Token to sell"
              value={fromToken}
              onChange={(e) => handlePairChange('from', e.target.value)}
              className="trade-token-select"
            >
              {assets.map((t) => (
                <option key={t.address} value={t.address}>
                  {t.symbol}
                </option>
              ))}
            </select>
            <button type="button" onClick={handleSetMax} className="trade-max-btn">
              MAX
            </button>
          </div>
        </div>

        <div className="trade-switch-row">
          <button
            type="button"
            onClick={handleFlipTokens}
            className="trade-switch-btn"
            aria-label="Switch direction"
          >
            ↓↑
          </button>
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
            <select
              aria-label="Token to buy"
              value={toToken}
              onChange={(e) => handlePairChange('to', e.target.value)}
              className="trade-token-select"
            >
              {assets.map((t) => (
                <option key={t.address} value={t.address}>
                  {t.symbol}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Trade summary — the capital-markets read-out */}
      {quote && (
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

      {severity === 'high' && (
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
          : quotingPrice
            ? 'Fetching best price…'
            : quote
              ? priceType === 'limit'
                ? `Place limit order — ${symbolFor(fromToken)} for ${symbolFor(toToken)}`
                : `Swap ${symbolFor(fromToken)} for ${symbolFor(toToken)}`
              : 'Enter an amount'}
      </button>

      {isPasskey && passkeyReady && !isVault && !isLegacy && (
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
