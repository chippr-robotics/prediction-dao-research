import { useState, useEffect } from 'react'
import { useDex } from '../../hooks/useDex'
import { SLIPPAGE_OPTIONS, getExplorerUrl } from '../../constants/dex'
import { useWallet } from '../../hooks'
import { useChainTokens } from '../../hooks/useChainTokens'
import './SwapPanel.css'

const FROM_NATIVE = 'NATIVE'
const FROM_WNATIVE = 'WNATIVE'
const FROM_STABLE = 'STABLE'

function SwapPanel() {
  const {
    balances,
    loading,
    quotingPrice,
    wrapNative,
    unwrapNative,
    swap,
    getQuote,
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

  const wnativeSymbol = nativeSymbol ? `W${nativeSymbol}` : 'WNATIVE'
  const labelFor = (key) => {
    if (key === FROM_NATIVE) return nativeSymbol
    if (key === FROM_WNATIVE) return wnativeSymbol
    return stableSymbol
  }

  const [swapMode, setSwapMode] = useState('wrap')
  const [fromToken, setFromToken] = useState(FROM_NATIVE)
  const [toToken, setToToken] = useState(FROM_WNATIVE)
  const [amount, setAmount] = useState('')
  const [estimatedOutput, setEstimatedOutput] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const updateQuote = async () => {
      if (!amount || parseFloat(amount) <= 0) {
        setEstimatedOutput('')
        return
      }

      if (swapMode === 'swap' && fromToken !== toToken) {
        try {
          const tokenInAddr = fromToken === FROM_WNATIVE ? addresses.WNATIVE : addresses.STABLECOIN
          const tokenOutAddr = toToken === FROM_WNATIVE ? addresses.WNATIVE : addresses.STABLECOIN
          const quote = await getQuote(tokenInAddr, tokenOutAddr, amount)
          setEstimatedOutput(quote)
        } catch (err) {
          console.error('Error getting quote:', err)
          setEstimatedOutput('Unable to get quote')
        }
      } else if (swapMode === 'wrap' || swapMode === 'unwrap') {
        setEstimatedOutput(amount)
      }
    }

    const timeoutId = setTimeout(updateQuote, 500)
    return () => clearTimeout(timeoutId)
  }, [amount, fromToken, toToken, swapMode, getQuote, addresses])

  const handleModeChange = (mode) => {
    setSwapMode(mode)
    setAmount('')
    setEstimatedOutput('')
    setError('')
    setSuccess('')

    if (mode === 'wrap') {
      setFromToken(FROM_NATIVE)
      setToToken(FROM_WNATIVE)
    } else if (mode === 'unwrap') {
      setFromToken(FROM_WNATIVE)
      setToToken(FROM_NATIVE)
    } else {
      setFromToken(FROM_WNATIVE)
      setToToken(FROM_STABLE)
    }
  }

  const handleFlipTokens = () => {
    const temp = fromToken
    setFromToken(toToken)
    setToToken(temp)
    setAmount('')
    setEstimatedOutput('')
  }

  const handleExecute = async () => {
    setError('')
    setSuccess('')

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount')
      return
    }

    try {
      if (swapMode === 'wrap') {
        await wrapNative(amount)
        setSuccess(`Successfully wrapped ${amount} ${nativeSymbol} to ${wnativeSymbol}`)
      } else if (swapMode === 'unwrap') {
        await unwrapNative(amount)
        setSuccess(`Successfully unwrapped ${amount} ${wnativeSymbol} to ${nativeSymbol}`)
      } else {
        const tokenInAddr = fromToken === FROM_WNATIVE ? addresses.WNATIVE : addresses.STABLECOIN
        const tokenOutAddr = toToken === FROM_WNATIVE ? addresses.WNATIVE : addresses.STABLECOIN
        await swap(tokenInAddr, tokenOutAddr, amount)
        setSuccess(`Successfully swapped ${amount} ${labelFor(fromToken)} to ${labelFor(toToken)}`)
      }

      setAmount('')
      setEstimatedOutput('')
    } catch (err) {
      console.error('Transaction error:', err)
      setError(err.message || 'Transaction failed')
    }
  }

  const handleSetMax = () => {
    if (fromToken === FROM_NATIVE) {
      const maxAmount = Math.max(0, parseFloat(balances.native) - 0.01)
      setAmount(maxAmount.toString())
    } else if (fromToken === FROM_WNATIVE) {
      setAmount(balances.wnative)
    } else if (fromToken === FROM_STABLE) {
      setAmount(balances.stable)
    }
  }

  if (!isConnected) {
    return (
      <div className="swap-panel">
        <div className="swap-header">
          <h2>Swap</h2>
          <p className="subtitle">Wrap, unwrap, and swap on the active chain</p>
        </div>
        <div className="connect-message">
          <p>Please connect your wallet to swap</p>
        </div>
      </div>
    )
  }

  if (!isDexAvailable) {
    return (
      <div className="swap-panel">
        <div className="swap-header">
          <h2>Swap</h2>
          <p className="subtitle">Swaps are not available on {networkName}</p>
        </div>
        <div className="connect-message">
          <p>
            {dexProvider
              ? `${providerName} is not configured on ${networkName}. Switch to a network with a configured DEX, or supply the ${providerName} contract addresses for ${networkName} to enable in-app swaps.`
              : `No DEX is configured on ${networkName}. Switch to a network with a configured DEX to enable in-app swaps.`}
          </p>
        </div>
      </div>
    )
  }

  const balanceFor = (key) => {
    if (key === FROM_NATIVE) return balances.native
    if (key === FROM_WNATIVE) return balances.wnative
    return balances.stable
  }

  return (
    <div className="swap-panel">
      <div className="swap-header">
        <h2>Swap</h2>
        <p className="subtitle">Wrap, unwrap, and swap via {providerName}</p>
      </div>

      <div className="mode-selector" role="tablist" aria-label="Swap mode">
        <button
          role="tab"
          aria-selected={swapMode === 'wrap'}
          className={`mode-btn ${swapMode === 'wrap' ? 'active' : ''}`}
          onClick={() => handleModeChange('wrap')}
        >
          Wrap {nativeSymbol}
        </button>
        <button
          role="tab"
          aria-selected={swapMode === 'unwrap'}
          className={`mode-btn ${swapMode === 'unwrap' ? 'active' : ''}`}
          onClick={() => handleModeChange('unwrap')}
        >
          Unwrap {nativeSymbol}
        </button>
        <button
          role="tab"
          aria-selected={swapMode === 'swap'}
          className={`mode-btn ${swapMode === 'swap' ? 'active' : ''}`}
          onClick={() => handleModeChange('swap')}
        >
          Swap Tokens
        </button>
      </div>

      <div className="swap-form">
        <div className="token-input-group">
          <label htmlFor="from-amount">From</label>
          <div className="token-input">
            {swapMode === 'swap' ? (
              <select
                id="from-token"
                value={fromToken}
                onChange={(e) => setFromToken(e.target.value)}
                className="token-select"
              >
                <option value={FROM_WNATIVE}>{wnativeSymbol}</option>
                <option value={FROM_STABLE}>{stableSymbol}</option>
              </select>
            ) : (
              <div className="token-display">{labelFor(fromToken)}</div>
            )}
            <input
              id="from-amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              step="0.000001"
              min="0"
              className="amount-input"
            />
            <button
              onClick={handleSetMax}
              className="max-btn"
              aria-label="Set maximum amount"
            >
              MAX
            </button>
          </div>
          <div className="balance-info">
            Balance: {balanceFor(fromToken)} {labelFor(fromToken)}
          </div>
        </div>

        {swapMode === 'swap' && (
          <div className="swap-direction">
            <button
              onClick={handleFlipTokens}
              className="flip-btn"
              aria-label="Flip swap direction"
            >
              ⇅
            </button>
          </div>
        )}

        {swapMode !== 'swap' && (
          <div className="swap-arrow">↓</div>
        )}

        <div className="token-input-group">
          <label htmlFor="to-amount">To</label>
          <div className="token-input">
            {swapMode === 'swap' ? (
              <select
                id="to-token"
                value={toToken}
                onChange={(e) => setToToken(e.target.value)}
                className="token-select"
              >
                <option value={FROM_WNATIVE}>{wnativeSymbol}</option>
                <option value={FROM_STABLE}>{stableSymbol}</option>
              </select>
            ) : (
              <div className="token-display">{labelFor(toToken)}</div>
            )}
            <div className="amount-display">
              {quotingPrice ? '...' : estimatedOutput || '0.0'}
            </div>
          </div>
          <div className="balance-info">
            Balance: {balanceFor(toToken)} {labelFor(toToken)}
          </div>
        </div>

        {swapMode === 'swap' && (
          <div className="slippage-settings">
            <label htmlFor="slippage-select">Slippage Tolerance</label>
            <select
              id="slippage-select"
              value={slippage}
              onChange={(e) => setSlippage(parseInt(e.target.value))}
              className="slippage-select"
            >
              {SLIPPAGE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={handleExecute}
          disabled={loading || !amount || parseFloat(amount) <= 0}
          className="execute-btn"
        >
          {loading
            ? 'Processing...'
            : swapMode === 'wrap'
            ? `Wrap ${nativeSymbol}`
            : swapMode === 'unwrap'
            ? `Unwrap ${wnativeSymbol}`
            : 'Swap Tokens'}
        </button>

        {error && (
          <div className="message error-message" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="message success-message" role="status">
            {success}
          </div>
        )}
      </div>

      <div className="contract-links">
        <h3>Contract Addresses</h3>
        <div className="links-grid">
          <a
            href={getExplorerUrl(chainId, addresses.WNATIVE, 'token')}
            target="_blank"
            rel="noopener noreferrer"
            className="contract-link"
          >
            {wnativeSymbol} Contract ↗
          </a>
          <a
            href={getExplorerUrl(chainId, addresses.STABLECOIN, 'token')}
            target="_blank"
            rel="noopener noreferrer"
            className="contract-link"
          >
            {stableSymbol} Contract ↗
          </a>
          <a
            href={getExplorerUrl(chainId, addresses.SWAP_ROUTER_02, 'address')}
            target="_blank"
            rel="noopener noreferrer"
            className="contract-link"
          >
            {providerName} Router ↗
          </a>
          {providerUrl && (
            <a
              href={providerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="contract-link"
            >
              Open {providerName} ↗
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default SwapPanel
