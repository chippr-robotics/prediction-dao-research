import { useState, useEffect } from 'react'
import { useETCswap } from '../../hooks/useETCswap'
import { TOKENS, SLIPPAGE_OPTIONS, getExplorerUrl } from '../../constants/etcswap'
import { useWallet } from '../../hooks'
import './SwapPanel.css'

function SwapPanel() {
  const { 
    balances, 
    loading, 
    quotingPrice,
    wrapETC, 
    unwrapWETC, 
    swap, 
    getQuote,
    slippage,
    setSlippage,
    addresses 
  } = useETCswap()
  
  const { isConnected, chainId } = useWallet()
  
  const [swapMode, setSwapMode] = useState('wrap') // 'wrap', 'unwrap', 'swap'
  const [fromToken, setFromToken] = useState('ETC')
  const [toToken, setToToken] = useState('WETC')
  const [amount, setAmount] = useState('')
  const [estimatedOutput, setEstimatedOutput] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // Update estimated output when amount or tokens change
  useEffect(() => {
    const updateQuote = async () => {
      if (!amount || parseFloat(amount) <= 0) {
        setEstimatedOutput('')
        return
      }
      
      if (swapMode === 'swap' && fromToken !== toToken) {
        try {
          const tokenInAddr = fromToken === 'WETC' ? addresses.WETC : addresses.USC_STABLECOIN
          const tokenOutAddr = toToken === 'WETC' ? addresses.WETC : addresses.USC_STABLECOIN
          const quote = await getQuote(tokenInAddr, tokenOutAddr, amount)
          setEstimatedOutput(quote)
        } catch (err) {
          console.error('Error getting quote:', err)
          setEstimatedOutput('Unable to get quote')
        }
      } else if (swapMode === 'wrap' || swapMode === 'unwrap') {
        // 1:1 ratio for wrap/unwrap
        setEstimatedOutput(amount)
      }
    }
    
    const timeoutId = setTimeout(updateQuote, 500)
    return () => clearTimeout(timeoutId)
  }, [amount, fromToken, toToken, swapMode, getQuote, addresses])
  
  // Change swap mode
  const handleModeChange = (mode) => {
    setSwapMode(mode)
    setAmount('')
    setEstimatedOutput('')
    setError('')
    setSuccess('')
    
    if (mode === 'wrap') {
      setFromToken('ETC')
      setToToken('WETC')
    } else if (mode === 'unwrap') {
      setFromToken('WETC')
      setToToken('ETC')
    } else {
      setFromToken('WETC')
      setToToken('USC')
    }
  }
  
  // Handle swap direction flip
  const handleFlipTokens = () => {
    const temp = fromToken
    setFromToken(toToken)
    setToToken(temp)
    setAmount('')
    setEstimatedOutput('')
  }
  
  // Execute transaction
  const handleExecute = async () => {
    setError('')
    setSuccess('')
    
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount')
      return
    }
    
    try {
      let tx
      
      if (swapMode === 'wrap') {
        tx = await wrapETC(amount)
        setSuccess(`Successfully wrapped ${amount} ETC to WETC`)
      } else if (swapMode === 'unwrap') {
        tx = await unwrapWETC(amount)
        setSuccess(`Successfully unwrapped ${amount} WETC to ETC`)
      } else {
        const tokenInAddr = fromToken === 'WETC' ? addresses.WETC : addresses.USC_STABLECOIN
        const tokenOutAddr = toToken === 'WETC' ? addresses.WETC : addresses.USC_STABLECOIN
        tx = await swap(tokenInAddr, tokenOutAddr, amount)
        setSuccess(`Successfully swapped ${amount} ${fromToken} to ${toToken}`)
      }
      
      setAmount('')
      setEstimatedOutput('')
    } catch (err) {
      console.error('Transaction error:', err)
      setError(err.message || 'Transaction failed')
    }
  }
  
  // Set max balance
  const handleSetMax = () => {
    if (fromToken === 'ETC') {
      // Reserve some for gas
      const maxAmount = Math.max(0, parseFloat(balances.etc) - 0.01)
      setAmount(maxAmount.toString())
    } else if (fromToken === 'WETC') {
      setAmount(balances.wetc)
    } else if (fromToken === 'USC') {
      setAmount(balances.usc)
    }
  }
  
  if (!isConnected) {
    return (
      <div className="swap-panel">
        <div className="swap-header">
          <h2>ETCswap</h2>
          <p className="subtitle">Swap tokens on Ethereum Classic</p>
        </div>
        <div className="connect-message">
          <p>Please connect your wallet to use ETCswap</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="swap-panel">
      <div className="swap-header">
        <h2>ETCswap</h2>
        <p className="subtitle">Swap tokens on Ethereum Classic</p>
      </div>
      
      {/* Mode Selector */}
      <div className="mode-selector" role="tablist" aria-label="Swap mode">
        <button
          role="tab"
          aria-selected={swapMode === 'wrap'}
          className={`mode-btn ${swapMode === 'wrap' ? 'active' : ''}`}
          onClick={() => handleModeChange('wrap')}
        >
          Wrap ETC
        </button>
        <button
          role="tab"
          aria-selected={swapMode === 'unwrap'}
          className={`mode-btn ${swapMode === 'unwrap' ? 'active' : ''}`}
          onClick={() => handleModeChange('unwrap')}
        >
          Unwrap ETC
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
      
      {/* Swap Form */}
      <div className="swap-form">
        {/* From Token */}
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
                <option value="WETC">WETC</option>
                <option value="USC">USC</option>
              </select>
            ) : (
              <div className="token-display">{fromToken}</div>
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
            Balance: {
              fromToken === 'ETC' ? balances.etc :
              fromToken === 'WETC' ? balances.wetc :
              balances.usc
            } {fromToken}
          </div>
        </div>
        
        {/* Swap Direction Button */}
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
        
        {/* To Token */}
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
                <option value="WETC">WETC</option>
                <option value="USC">USC</option>
              </select>
            ) : (
              <div className="token-display">{toToken}</div>
            )}
            <div className="amount-display">
              {quotingPrice ? '...' : estimatedOutput || '0.0'}
            </div>
          </div>
          <div className="balance-info">
            Balance: {
              toToken === 'ETC' ? balances.etc :
              toToken === 'WETC' ? balances.wetc :
              balances.usc
            } {toToken}
          </div>
        </div>
        
        {/* Slippage Settings */}
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
        
        {/* Execute Button */}
        <button
          onClick={handleExecute}
          disabled={loading || !amount || parseFloat(amount) <= 0}
          className="execute-btn"
        >
          {loading ? 'Processing...' : 
           swapMode === 'wrap' ? 'Wrap ETC' :
           swapMode === 'unwrap' ? 'Unwrap WETC' :
           'Swap Tokens'}
        </button>
        
        {/* Messages */}
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
      
      {/* Contract Links */}
      <div className="contract-links">
        <h3>Contract Addresses</h3>
        <div className="links-grid">
          <a
            href={getExplorerUrl(chainId, addresses.WETC, 'token')}
            target="_blank"
            rel="noopener noreferrer"
            className="contract-link"
          >
            WETC Contract ↗
          </a>
          <a
            href={getExplorerUrl(chainId, addresses.USC_STABLECOIN, 'token')}
            target="_blank"
            rel="noopener noreferrer"
            className="contract-link"
          >
            USC Contract ↗
          </a>
          <a
            href={getExplorerUrl(chainId, addresses.SWAP_ROUTER_02, 'address')}
            target="_blank"
            rel="noopener noreferrer"
            className="contract-link"
          >
            Swap Router ↗
          </a>
        </div>
      </div>
    </div>
  )
}

export default SwapPanel
