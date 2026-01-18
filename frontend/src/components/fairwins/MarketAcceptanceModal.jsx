import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import { useWallet, useWeb3 } from '../../hooks'
import { ETCSWAP_ADDRESSES } from '../../constants/etcswap'
import './MarketAcceptanceModal.css'

// Helper to format stake amount as USD (rounded to nearest cent)
const formatUSD = (amount, symbol) => {
  const num = parseFloat(amount) || 0
  // Only show USD formatting for stablecoins
  const isStablecoin = symbol === 'USC' || symbol === 'USDC' || symbol === 'USDT' || symbol === 'DAI'

  if (isStablecoin) {
    if (num === 0) return '$0.00'
    if (num < 0.01) return '< $0.01'
    return `$${num.toFixed(2)}`
  }
  // For non-stablecoins, show raw amount with symbol
  return `${num} ${symbol || 'tokens'}`
}

/**
 * MarketAcceptanceModal Component
 *
 * Displays market terms for counterparty/arbitrator to review and accept.
 * Accessible via QR code scan or deep link.
 *
 * Features:
 * - Market terms display
 * - Time remaining countdown
 * - Acceptance progress
 * - Accept/Decline actions
 * - Transaction processing states
 */
function MarketAcceptanceModal({
  isOpen,
  onClose,
  marketId,
  marketData,
  onAccepted,
  contractAddress,
  contractABI
}) {
  const { isConnected, account } = useWallet()
  const { signer, isCorrectNetwork, switchNetwork } = useWeb3()

  const [step, setStep] = useState('review') // 'review', 'confirm', 'processing', 'success', 'error'
  const [error, setError] = useState(null)
  const [txHash, setTxHash] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState(0)

  // Determine user's role
  const isArbitrator = marketData?.arbitrator?.toLowerCase() === account?.toLowerCase()
  const isParticipant = marketData?.participants?.some(
    p => p.toLowerCase() === account?.toLowerCase()
  )
  const hasAlreadyAccepted = marketData?.acceptances?.[account?.toLowerCase()]?.hasAccepted

  // Calculate time remaining
  useEffect(() => {
    if (!marketData?.acceptanceDeadline) return

    const updateTimeRemaining = () => {
      const remaining = Math.max(0, marketData.acceptanceDeadline - Date.now())
      setTimeRemaining(remaining)
    }

    updateTimeRemaining()
    const interval = setInterval(updateTimeRemaining, 1000)

    return () => clearInterval(interval)
  }, [marketData?.acceptanceDeadline])

  // Format time remaining
  const formatTimeRemaining = useCallback(() => {
    if (timeRemaining <= 0) return 'Expired'

    const hours = Math.floor(timeRemaining / (1000 * 60 * 60))
    const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000)

    if (hours > 24) {
      const days = Math.floor(hours / 24)
      return `${days}d ${hours % 24}h remaining`
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`
    }
    return `${minutes}m ${seconds}s remaining`
  }, [timeRemaining])

  // Format address for display
  const formatAddress = (address) => {
    if (!address) return ''
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const handleAccept = async () => {
    if (!signer) {
      setError('Please connect your wallet')
      return
    }

    if (!isCorrectNetwork) {
      try {
        await switchNetwork()
      } catch {
        setError('Please switch to the correct network')
        return
      }
    }

    setStep('processing')
    setError(null)

    try {
      // Check deadline hasn't passed BEFORE calling contract
      if (marketData?.acceptanceDeadline && Date.now() >= marketData.acceptanceDeadline) {
        throw new Error('The acceptance deadline has passed. This market can no longer be accepted.')
      }

      const contract = new ethers.Contract(
        contractAddress,
        contractABI,
        signer
      )

      let tx
      if (isArbitrator) {
        // Arbitrators don't stake
        tx = await contract.acceptMarket(marketId)
      } else {
        // Determine token decimals - USC has 6 decimals, most others have 18
        const isUSC = marketData.stakeToken &&
          marketData.stakeToken.toLowerCase() === ETCSWAP_ADDRESSES?.USC_STABLECOIN?.toLowerCase()
        const tokenDecimals = isUSC ? 6 : 18

        // Participants stake
        const stakeAmount = ethers.parseUnits(
          marketData.stakePerParticipant || '0',
          tokenDecimals
        )

        console.log('Stake calculation:', {
          stakePerParticipant: marketData.stakePerParticipant,
          isUSC,
          tokenDecimals,
          stakeAmountWei: stakeAmount.toString()
        })

        if (!marketData.stakeToken || marketData.stakeToken === ethers.ZeroAddress) {
          // Native token stake - check balance first
          const balance = await signer.provider.getBalance(account)
          console.log('Native balance check:', {
            balance: balance.toString(),
            balanceFormatted: ethers.formatEther(balance),
            required: stakeAmount.toString(),
            requiredFormatted: ethers.formatUnits(stakeAmount, 18)
          })
          if (balance < stakeAmount) {
            throw new Error(
              `Insufficient ETC balance. You have ${ethers.formatEther(balance)} but need ${ethers.formatUnits(stakeAmount, 18)} ETC.`
            )
          }
          tx = await contract.acceptMarket(marketId, { value: stakeAmount })
        } else {
          // ERC20 token - check balance and approval
          const tokenContract = new ethers.Contract(
            marketData.stakeToken,
            [
              'function approve(address,uint256) returns (bool)',
              'function allowance(address,address) view returns (uint256)',
              'function balanceOf(address) view returns (uint256)',
              'function symbol() view returns (string)'
            ],
            signer
          )

          // Check balance first
          const balance = await tokenContract.balanceOf(account)
          let tokenSymbol = marketData.stakeTokenSymbol || 'tokens'
          try {
            tokenSymbol = await tokenContract.symbol()
          } catch {
            // Use default from marketData
          }

          console.log('ERC20 balance check:', {
            balance: balance.toString(),
            balanceFormatted: ethers.formatUnits(balance, tokenDecimals),
            required: stakeAmount.toString(),
            requiredFormatted: ethers.formatUnits(stakeAmount, tokenDecimals),
            tokenSymbol
          })

          if (balance < stakeAmount) {
            throw new Error(
              `Insufficient ${tokenSymbol} balance. You have ${ethers.formatUnits(balance, tokenDecimals)} but need ${ethers.formatUnits(stakeAmount, tokenDecimals)} ${tokenSymbol}.`
            )
          }

          // Check if we already have enough allowance
          const currentAllowance = await tokenContract.allowance(account, contractAddress)
          console.log('Allowance check:', {
            currentAllowance: currentAllowance.toString(),
            required: stakeAmount.toString(),
            sufficient: currentAllowance >= stakeAmount
          })

          if (currentAllowance < stakeAmount) {
            console.log('Approving token for contract...')
            const approveTx = await tokenContract.approve(contractAddress, stakeAmount)
            await approveTx.wait()
            console.log('Token approved')
          }

          // Use higher gas limit for acceptMarket + activation flow
          // The full flow (stake collection + market activation + deployMarketPair) needs ~1M gas
          console.log('Calling acceptMarket with gas limit 1200000...')
          tx = await contract.acceptMarket(marketId, { gasLimit: 1200000 })
        }
      }

      setTxHash(tx.hash)
      await tx.wait()

      setStep('success')
      if (onAccepted) onAccepted(marketId)

    } catch (err) {
      console.error('Error accepting market:', err)

      // Decode known FriendGroupMarketFactory error selectors
      const errorSelectors = {
        '0x06417a60': 'Invalid market ID - the market does not exist',
        '0x7dc6505a': 'Market is not pending - it may have already been activated or cancelled',
        '0x70f65caa': 'Acceptance deadline has passed - the market has expired',
        '0x1aa8064c': 'Already accepted - you have already accepted this market',
        '0x779a6f41': 'Not invited - you are not a participant in this market',
        '0x90b8ec18': 'Transfer failed - check your token balance and approval',
        '0xcd1c8867': 'Insufficient payment - not enough ETC/tokens sent'
      }

      let errorMessage = err.reason || err.message || 'Failed to accept market'

      // Try to decode error data if available
      if (err.data) {
        const selector = typeof err.data === 'string' ? err.data.slice(0, 10) : null
        if (selector && errorSelectors[selector]) {
          errorMessage = errorSelectors[selector]
        }
      }

      // Check for common error patterns in the message
      if (errorMessage.includes('missing revert data') || errorMessage.includes('unknown custom error')) {
        // Check if there's error data in the transaction info
        const txData = err.transaction?.data || err.info?.error?.data
        if (txData) {
          const selector = typeof txData === 'string' ? txData.slice(0, 10) : null
          if (selector && errorSelectors[selector]) {
            errorMessage = errorSelectors[selector]
          }
        } else {
          errorMessage = 'Transaction failed. Please check your balance and allowance, then try again.'
        }
      }

      setError(errorMessage)
      setStep('error')
    }
  }

  const handleDecline = () => {
    // Just close - no on-chain action needed
    onClose()
  }

  const handleRetry = () => {
    setStep('review')
    setError(null)
    setTxHash(null)
  }

  if (!isOpen) return null

  const isExpired = timeRemaining <= 0
  const canAccept = isConnected && !hasAlreadyAccepted && !isExpired && (isParticipant || isArbitrator)

  return (
    <div
      className="ma-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ma-title"
    >
      <div className="ma-modal">
        <header className="ma-header">
          <h2 id="ma-title">
            {isArbitrator ? 'Accept Arbitrator Role' : 'Accept Market Invitation'}
          </h2>
          <button
            className="ma-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </header>

        <div className="ma-content">
          {step === 'review' && (
            <>
              {/* Market Details */}
              <div className="ma-market-info">
                <h3 className="ma-description">{marketData?.description}</h3>
                <div className={`ma-deadline-warning ${isExpired ? 'expired' : ''}`}>
                  <span className="ma-clock-icon">&#9200;</span>
                  <span>{formatTimeRemaining()}</span>
                </div>
              </div>

              {/* Terms Grid */}
              <div className="ma-terms-grid">
                <div className="ma-term">
                  <label>Market Type</label>
                  <span className="ma-value">{marketData?.marketType || 'Friend Market'}</span>
                </div>
                <div className="ma-term">
                  <label>Created By</label>
                  <span className="ma-value ma-address">
                    {formatAddress(marketData?.creator)}
                  </span>
                </div>
                <div className="ma-term">
                  <label>Participants</label>
                  <span className="ma-value">{marketData?.participants?.length || 0}</span>
                </div>
                <div className="ma-term">
                  <label>Accepted</label>
                  <span className="ma-value">
                    {marketData?.acceptedCount || 0} / {marketData?.minAcceptanceThreshold || 2}
                  </span>
                </div>
                {!isArbitrator && (
                  <div className="ma-term ma-term-highlight">
                    <label>Your Stake</label>
                    <span className="ma-value">
                      {formatUSD(marketData?.stakePerParticipant, marketData?.stakeTokenSymbol)}
                    </span>
                  </div>
                )}
                {isArbitrator && (
                  <div className="ma-term ma-term-info">
                    <label>Role</label>
                    <span className="ma-value">Arbitrator (No Stake Required)</span>
                  </div>
                )}
              </div>

              {/* Participants List */}
              <div className="ma-participants">
                <h4>Participants</h4>
                <ul className="ma-participants-list">
                  {marketData?.participants?.map((p, i) => {
                    const isAccepted = marketData?.acceptances?.[p.toLowerCase()]?.hasAccepted
                    const isCreator = p.toLowerCase() === marketData?.creator?.toLowerCase()
                    const isYou = p.toLowerCase() === account?.toLowerCase()

                    return (
                      <li key={i} className={isAccepted ? 'accepted' : 'pending'}>
                        <span className="ma-participant-addr">
                          {formatAddress(p)}
                          {isCreator && <span className="ma-badge creator">Creator</span>}
                          {isYou && <span className="ma-badge you">You</span>}
                        </span>
                        <span className="ma-participant-status">
                          {isAccepted ? '✓ Accepted' : '⏳ Pending'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>

              {/* Already accepted message */}
              {hasAlreadyAccepted && (
                <div className="ma-already-accepted">
                  <span>&#10003;</span>
                  You have already accepted this market
                </div>
              )}

              {/* Expired message */}
              {isExpired && !hasAlreadyAccepted && (
                <div className="ma-expired">
                  <span>&#9888;</span>
                  The acceptance deadline has passed
                </div>
              )}

              {/* Not invited message */}
              {!isParticipant && !isArbitrator && (
                <div className="ma-not-invited">
                  <span>&#9888;</span>
                  You are not invited to this market
                </div>
              )}

              {/* Action buttons */}
              {canAccept && (
                <div className="ma-actions">
                  <button className="ma-btn-secondary" onClick={handleDecline}>
                    Decline
                  </button>
                  <button
                    className="ma-btn-primary"
                    onClick={() => setStep('confirm')}
                  >
                    {isArbitrator ? 'Accept Role' : 'Stake & Accept'}
                  </button>
                </div>
              )}

              {!isConnected && (
                <div className="ma-connect-prompt">
                  Please connect your wallet to accept this market
                </div>
              )}
            </>
          )}

          {step === 'confirm' && (
            <div className="ma-confirmation">
              <h3>Confirm Acceptance</h3>

              {/* Safety Warning Section */}
              <div className="ma-safety-warning">
                <div className="ma-safety-header">
                  <span className="ma-safety-icon">&#9888;</span>
                  <strong>Important Safety Information</strong>
                </div>
                <ul className="ma-safety-list">
                  <li>
                    <span className="ma-check-icon">&#10004;</span>
                    <span><strong>Only accept markets from people you know and trust.</strong> Never accept invitations from strangers.</span>
                  </li>
                  <li>
                    <span className="ma-check-icon">&#10004;</span>
                    <span><strong>This action is permanent and cannot be undone.</strong> Your stake will be locked until the market resolves.</span>
                  </li>
                  <li>
                    <span className="ma-check-icon">&#10004;</span>
                    <span><strong>Do not include personal information (PII)</strong> in any market descriptions or communications.</span>
                  </li>
                  <li>
                    <span className="ma-check-icon">&#10004;</span>
                    <span><strong>Verify the market terms carefully</strong> before accepting. You are agreeing to these exact terms.</span>
                  </li>
                </ul>
              </div>

              {!isArbitrator && (
                <p className="ma-stake-notice">
                  You are about to stake <strong>{formatUSD(marketData?.stakePerParticipant, marketData?.stakeTokenSymbol)}</strong> to join this market.
                </p>
              )}
              {isArbitrator && (
                <p className="ma-stake-notice">
                  You are accepting the role of arbitrator for this market.
                  You will be responsible for resolving disputes fairly.
                </p>
              )}
              <div className="ma-confirm-details">
                <div className="ma-confirm-row">
                  <span>Market:</span>
                  <span>{marketData?.description?.slice(0, 50)}...</span>
                </div>
                <div className="ma-confirm-row">
                  <span>Created By:</span>
                  <span className="ma-address">{formatAddress(marketData?.creator)}</span>
                </div>
                {!isArbitrator && (
                  <div className="ma-confirm-row">
                    <span>Your Stake:</span>
                    <span>{formatUSD(marketData?.stakePerParticipant, marketData?.stakeTokenSymbol)}</span>
                  </div>
                )}
              </div>
              <div className="ma-actions">
                <button className="ma-btn-secondary" onClick={() => setStep('review')}>
                  Back
                </button>
                <button className="ma-btn-primary" onClick={handleAccept}>
                  I Understand, Accept Market
                </button>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="ma-processing">
              <div className="ma-spinner"></div>
              <h3>Processing...</h3>
              <p>Please confirm the transaction in your wallet</p>
            </div>
          )}

          {step === 'success' && (
            <div className="ma-success">
              <div className="ma-success-icon">&#10003;</div>
              <h3>Successfully Accepted!</h3>
              <p>
                {isArbitrator
                  ? 'You are now the arbitrator for this market.'
                  : 'Your stake has been deposited. The market will activate when all required participants accept.'}
              </p>
              {txHash && (
                <a
                  href={`https://blockscout.com/etc/mordor/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ma-tx-link"
                >
                  View Transaction
                </a>
              )}
              <button className="ma-btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          )}

          {step === 'error' && (
            <div className="ma-error">
              <div className="ma-error-icon">&times;</div>
              <h3>Transaction Failed</h3>
              <p className="ma-error-message">{error}</p>
              <div className="ma-actions">
                <button className="ma-btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button className="ma-btn-primary" onClick={handleRetry}>
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MarketAcceptanceModal
