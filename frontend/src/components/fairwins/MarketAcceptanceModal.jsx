import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import { useWallet, useWeb3 } from '../../hooks'
import { useEncryption } from '../../hooks/useEncryption'
import { ETCSWAP_ADDRESSES } from '../../constants/etcswap'
import { getTransactionUrl } from '../../config/blockExplorer'
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

// Helper to get human-readable resolution type label
const getResolutionLabel = (resolutionType) => {
  switch (resolutionType) {
    case 0: return 'Either Party'
    case 1: return 'Creator Only'
    case 2: return 'Opponent Only'
    case 3: return 'Third Party Arbitrator'
    case 4: return 'Linked Wager (Auto)'
    default: return 'Either Party'
  }
}

// Helper to get human-readable wager type label
const getWagerTypeLabel = (marketType) => {
  switch (marketType) {
    case 'oneVsOne': return '1v1'
    case 'smallGroup': return 'Group'
    case 'eventTracking': return 'Event'
    case 'bookmaker': return 'Bookmaker'
    case 'propBet': return 'Prop Bet'
    default: return marketType || 'Friend Wager'
  }
}

/**
 * MarketAcceptanceModal Component
 *
 * Displays offer terms for counterparty/arbitrator to review and accept.
 * Accessible via QR code scan or deep link.
 *
 * Features:
 * - Offer terms display with full details
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
  const { signer, isCorrectNetwork, switchNetwork, chainId } = useWeb3()
  const {
    decryptMetadata,
    canUserDecrypt,
    isInitialized: encryptionInitialized,
    isInitializing: encryptionInitializing,
    initializeKeys
  } = useEncryption()

  const [step, setStep] = useState('review') // 'review', 'confirm', 'processing', 'success', 'error'
  const [error, setError] = useState(null)
  const [txHash, setTxHash] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState(0)

  // Decryption state for encrypted wagers
  const [decryptedDescription, setDecryptedDescription] = useState(null)
  const [isDecrypting, setIsDecrypting] = useState(false)
  const [decryptionError, setDecryptionError] = useState(null)

  // Determine user's role
  const isArbitrator = marketData?.arbitrator?.toLowerCase() === account?.toLowerCase()
  const isParticipant = marketData?.participants?.some(
    p => p.toLowerCase() === account?.toLowerCase()
  )
  const isCreator = marketData?.creator?.toLowerCase() === account?.toLowerCase()
  // Creator's acceptance is automatically recorded at creation
  const hasAlreadyAccepted = isCreator || marketData?.acceptances?.[account?.toLowerCase()]?.hasAccepted

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

  // Attempt to decrypt encrypted wager description
  useEffect(() => {
    const tryDecrypt = async () => {
      if (!marketData?.isEncrypted || !marketData?.rawDescription) {
        return
      }

      setDecryptedDescription(null)
      setDecryptionError(null)

      if (!account) {
        setDecryptionError('Connect wallet to view encrypted content')
        return
      }

      try {
        const envelope = JSON.parse(marketData.rawDescription)

        if (!canUserDecrypt(envelope)) {
          setDecryptionError('You are not a participant in this encrypted wager')
          return
        }

        if (encryptionInitialized) {
          setIsDecrypting(true)
          const decrypted = await decryptMetadata(envelope)
          setDecryptedDescription(decrypted.description || decrypted.name || 'Wager Details')
          setIsDecrypting(false)
        }
      } catch (err) {
        console.error('Failed to decrypt wager:', err)
        setDecryptionError('Failed to decrypt wager content')
        setIsDecrypting(false)
      }
    }

    tryDecrypt()
  }, [marketData?.isEncrypted, marketData?.rawDescription, account, encryptionInitialized, canUserDecrypt, decryptMetadata])

  // Handler to manually trigger decryption (requires wallet signature)
  const handleDecrypt = async () => {
    if (!marketData?.rawDescription) return

    try {
      setIsDecrypting(true)
      setDecryptionError(null)

      if (!encryptionInitialized) {
        await initializeKeys()
      }

      const envelope = JSON.parse(marketData.rawDescription)
      const decrypted = await decryptMetadata(envelope)
      setDecryptedDescription(decrypted.description || decrypted.name || 'Wager Details')
    } catch (err) {
      console.error('Failed to decrypt wager:', err)
      setDecryptionError(err.message || 'Failed to decrypt')
    } finally {
      setIsDecrypting(false)
    }
  }

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
        throw new Error('The acceptance deadline has passed. This offer can no longer be accepted.')
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
        // CRITICAL: Fetch the actual on-chain stake value - don't rely on formatted data
        // The contract will use the raw on-chain value for the transfer, so we must match it
        const onChainMarket = await contract.getFriendMarketWithStatus(marketId)
        const stakeAmount = onChainMarket.stakePerParticipant
        const stakeTokenAddress = onChainMarket.stakeToken

        // Determine token decimals for display purposes
        const isUSC = stakeTokenAddress &&
          stakeTokenAddress.toLowerCase() === ETCSWAP_ADDRESSES?.USC_STABLECOIN?.toLowerCase()
        const tokenDecimals = isUSC ? 6 : 18

        console.log('Stake calculation (using on-chain value):', {
          stakePerParticipantFormatted: marketData.stakePerParticipant,
          stakePerParticipantOnChain: stakeAmount.toString(),
          stakeToken: stakeTokenAddress,
          isUSC,
          tokenDecimals
        })

        if (!stakeTokenAddress || stakeTokenAddress === ethers.ZeroAddress) {
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
              `Insufficient balance. You have ${ethers.formatEther(balance)} but need ${ethers.formatUnits(stakeAmount, 18)} ${marketData?.stakeTokenSymbol || 'tokens'}.`
            )
          }
          tx = await contract.acceptMarket(marketId, { value: stakeAmount })
        } else {
          // ERC20 token - check balance and approval
          const tokenContract = new ethers.Contract(
            stakeTokenAddress,
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
      console.error('Error accepting offer:', err)

      // Decode known FriendGroupMarketFactory error selectors
      const errorSelectors = {
        '0x06417a60': 'Invalid wager ID - the wager does not exist',
        '0x7dc6505a': 'Wager is not pending - it may have already been activated or cancelled',
        '0x70f65caa': 'Acceptance deadline has passed - the offer has expired',
        '0x1aa8064c': 'Already accepted - you have already accepted this offer',
        '0x779a6f41': 'Not invited - you are not a participant in this wager',
        '0x90b8ec18': 'Transfer failed - check your token balance and approval',
        '0xcd1c8867': 'Insufficient payment - not enough tokens sent'
      }

      let errorMessage = err.reason || err.message || 'Failed to accept offer'

      // Try to decode error data if available
      if (err.data) {
        const selector = typeof err.data === 'string' ? err.data.slice(0, 10) : null
        if (selector && errorSelectors[selector]) {
          errorMessage = errorSelectors[selector]
        }
      }

      // Check for common error patterns in the message
      if (errorMessage.includes('missing revert data') || errorMessage.includes('unknown custom error')) {
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

  // Calculate total pot for display
  const participantCount = marketData?.participants?.length || 0
  const stakePerPerson = parseFloat(marketData?.stakePerParticipant || 0)
  const totalPot = stakePerPerson * participantCount

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
            {isArbitrator ? 'Accept Arbitrator Role' : 'Review Offer'}
          </h2>
          <button
            className="ma-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </header>

        <div className="ma-content">
          {step === 'review' && (
            <>
              {/* Wager Description */}
              <div className="ma-market-info">
                {marketData?.isEncrypted ? (
                  <div className="ma-encrypted-section">
                    <div className="ma-encrypted-badge">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0110 0v4"/>
                      </svg>
                      <span>Private Wager</span>
                    </div>
                    {decryptedDescription ? (
                      <h3 className="ma-description">{decryptedDescription}</h3>
                    ) : isDecrypting || encryptionInitializing ? (
                      <div className="ma-decrypting">
                        <span className="ma-spinner-small"></span>
                        <span>Decrypting...</span>
                      </div>
                    ) : decryptionError ? (
                      <div className="ma-decrypt-error">
                        <p>{decryptionError}</p>
                        {(isParticipant || isArbitrator) && !encryptionInitialized && (
                          <button
                            type="button"
                            className="ma-btn-decrypt"
                            onClick={handleDecrypt}
                          >
                            Unlock to View Details
                          </button>
                        )}
                      </div>
                    ) : (isParticipant || isArbitrator) ? (
                      <div className="ma-decrypt-prompt">
                        <p>Sign a message to decrypt and view the wager details</p>
                        <button
                          type="button"
                          className="ma-btn-decrypt"
                          onClick={handleDecrypt}
                        >
                          Unlock Wager Details
                        </button>
                      </div>
                    ) : (
                      <p className="ma-encrypted-hint">Only participants can view encrypted wager details</p>
                    )}
                  </div>
                ) : (
                  <h3 className="ma-description">{marketData?.description}</h3>
                )}
                <div className={`ma-deadline-warning ${isExpired ? 'expired' : ''}`}>
                  <span className="ma-clock-icon">&#9200;</span>
                  <span>Accept by: {formatTimeRemaining()}</span>
                </div>
              </div>

              {/* Offer Details Section */}
              <div className="ma-offer-details">
                <h4>Offer Details</h4>
                <div className="ma-details-list">
                  <div className="ma-detail-row">
                    <span className="ma-detail-label">Wager Type</span>
                    <span className="ma-detail-value">{getWagerTypeLabel(marketData?.marketType)}</span>
                  </div>
                  <div className="ma-detail-row">
                    <span className="ma-detail-label">Created By</span>
                    <span className="ma-detail-value ma-address">{formatAddress(marketData?.creator)}</span>
                  </div>
                  <div className="ma-detail-row">
                    <span className="ma-detail-label">Resolution</span>
                    <span className="ma-detail-value">{getResolutionLabel(marketData?.resolutionType)}</span>
                  </div>
                  {marketData?.arbitrator && (
                    <div className="ma-detail-row">
                      <span className="ma-detail-label">Arbitrator</span>
                      <span className="ma-detail-value ma-address">{formatAddress(marketData.arbitrator)}</span>
                    </div>
                  )}
                  <div className="ma-detail-row">
                    <span className="ma-detail-label">Token</span>
                    <span className="ma-detail-value">{marketData?.stakeTokenSymbol || 'tokens'}</span>
                  </div>
                  <div className="ma-detail-row">
                    <span className="ma-detail-label">Participants</span>
                    <span className="ma-detail-value">
                      {marketData?.acceptedCount || 0} / {participantCount} accepted
                    </span>
                  </div>
                  {marketData?.estimatedMarketEndDate && (
                    <div className="ma-detail-row">
                      <span className="ma-detail-label">Wager Ends</span>
                      <span className="ma-detail-value">
                        {new Date(marketData.estimatedMarketEndDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Financial Summary */}
              {!isArbitrator && (
                <div className="ma-financial-summary">
                  <h4>What You Are Agreeing To</h4>
                  <div className="ma-financial-grid">
                    <div className="ma-financial-item ma-financial-stake">
                      <span className="ma-financial-label">Your Stake</span>
                      <span className="ma-financial-value">
                        {formatUSD(marketData?.stakePerParticipant, marketData?.stakeTokenSymbol)}
                      </span>
                    </div>
                    {marketData?.opponentOddsMultiplier && marketData?.opponentOddsMultiplier !== 200 && (
                      <div className="ma-financial-item">
                        <span className="ma-financial-label">Your Odds</span>
                        <span className="ma-financial-value ma-odds-value">
                          {marketData.opponentOddsMultiplier / 100}x
                        </span>
                      </div>
                    )}
                    <div className="ma-financial-item ma-financial-win">
                      <span className="ma-financial-label">If You Win</span>
                      <span className="ma-financial-value">
                        {formatUSD(
                          stakePerPerson * ((marketData?.opponentOddsMultiplier || 200) / 100),
                          marketData?.stakeTokenSymbol
                        )}
                      </span>
                    </div>
                    <div className="ma-financial-item ma-financial-lose">
                      <span className="ma-financial-label">If You Lose</span>
                      <span className="ma-financial-value">
                        -{formatUSD(marketData?.stakePerParticipant, marketData?.stakeTokenSymbol)}
                      </span>
                    </div>
                    {participantCount > 2 && (
                      <div className="ma-financial-item">
                        <span className="ma-financial-label">Total Pot</span>
                        <span className="ma-financial-value">
                          {formatUSD(totalPot, marketData?.stakeTokenSymbol)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {isArbitrator && (
                <div className="ma-financial-summary">
                  <h4>What You Are Agreeing To</h4>
                  <div className="ma-term ma-term-info">
                    <label>Role</label>
                    <span className="ma-value">Arbitrator (No Stake Required)</span>
                  </div>
                  <p className="ma-arbitrator-note">
                    You will be responsible for fairly resolving this wager when participants cannot agree.
                  </p>
                </div>
              )}

              {/* Participants List */}
              <div className="ma-participants">
                <h4>Participants</h4>
                <ul className="ma-participants-list">
                  {marketData?.participants?.map((p, i) => {
                    const isAccepted = marketData?.acceptances?.[p.toLowerCase()]?.hasAccepted
                    const isCreatorAddr = p.toLowerCase() === marketData?.creator?.toLowerCase()
                    const isYou = p.toLowerCase() === account?.toLowerCase()

                    return (
                      <li key={i} className={isAccepted ? 'accepted' : 'pending'}>
                        <span className="ma-participant-addr">
                          {formatAddress(p)}
                          {isCreatorAddr && <span className="ma-badge creator">Creator</span>}
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
                  {isCreator
                    ? 'You created this offer. Waiting for participants to consider and accept.'
                    : 'You have already accepted this offer'}
                </div>
              )}

              {/* Expired message */}
              {isExpired && !hasAlreadyAccepted && (
                <div className="ma-expired">
                  <span>&#9888;</span>
                  This offer has expired
                </div>
              )}

              {/* Not invited message */}
              {!isParticipant && !isArbitrator && (
                <div className="ma-not-invited">
                  <span>&#9888;</span>
                  You are not invited to this wager
                </div>
              )}

              {/* Action buttons */}
              {canAccept && (
                <div className="ma-actions">
                  <button className="ma-btn-secondary" onClick={handleDecline}>
                    Decline Offer
                  </button>
                  <button
                    className="ma-btn-primary"
                    onClick={() => setStep('confirm')}
                  >
                    {isArbitrator ? 'Accept Role' : 'Accept Offer'}
                  </button>
                </div>
              )}

              {!isConnected && (
                <div className="ma-connect-prompt">
                  Please connect your wallet to respond to this offer
                </div>
              )}
            </>
          )}

          {step === 'confirm' && (
            <div className="ma-confirmation">
              <h3>Confirm Offer Acceptance</h3>

              {/* Safety Warning Section */}
              <div className="ma-safety-warning">
                <div className="ma-safety-header">
                  <span className="ma-safety-icon">&#9888;</span>
                  <strong>Important Safety Information</strong>
                </div>
                <ul className="ma-safety-list">
                  <li>
                    <span className="ma-check-icon">&#10004;</span>
                    <span><strong>Only accept offers from people you know and trust.</strong> Never accept invitations from strangers.</span>
                  </li>
                  <li>
                    <span className="ma-check-icon">&#10004;</span>
                    <span><strong>This action is permanent and cannot be undone.</strong> Your stake will be locked until the wager resolves.</span>
                  </li>
                  <li>
                    <span className="ma-check-icon">&#10004;</span>
                    <span><strong>Do not include personal information (PII)</strong> in any wager descriptions or communications.</span>
                  </li>
                  <li>
                    <span className="ma-check-icon">&#10004;</span>
                    <span><strong>Verify the offer terms carefully</strong> before accepting. You are agreeing to these exact terms.</span>
                  </li>
                </ul>
              </div>

              {!isArbitrator && (
                <p className="ma-stake-notice">
                  You are about to stake <strong>{formatUSD(marketData?.stakePerParticipant, marketData?.stakeTokenSymbol)}</strong> to join this wager.
                  {marketData?.opponentOddsMultiplier && marketData?.opponentOddsMultiplier !== 200 && (
                    <> At <strong>{marketData.opponentOddsMultiplier / 100}x odds</strong>, you could win <strong>{formatUSD(parseFloat(marketData?.stakePerParticipant || 0) * marketData.opponentOddsMultiplier / 100, marketData?.stakeTokenSymbol)}</strong>.</>
                  )}
                  {(!marketData?.opponentOddsMultiplier || marketData?.opponentOddsMultiplier === 200) && (
                    <> If you win, you&apos;ll receive <strong>{formatUSD(parseFloat(marketData?.stakePerParticipant || 0) * 2, marketData?.stakeTokenSymbol)}</strong>.</>
                  )}
                </p>
              )}
              {isArbitrator && (
                <p className="ma-stake-notice">
                  You are accepting the role of arbitrator for this wager.
                  You will be responsible for resolving disputes fairly.
                </p>
              )}
              <div className="ma-confirm-details">
                <div className="ma-confirm-row">
                  <span>Wager:</span>
                  <span>
                    {(decryptedDescription || marketData?.description)?.slice(0, 50)}
                    {(decryptedDescription || marketData?.description)?.length > 50 ? '...' : ''}
                  </span>
                </div>
                <div className="ma-confirm-row">
                  <span>Created By:</span>
                  <span className="ma-address">{formatAddress(marketData?.creator)}</span>
                </div>
                <div className="ma-confirm-row">
                  <span>Resolution:</span>
                  <span>{getResolutionLabel(marketData?.resolutionType)}</span>
                </div>
                {!isArbitrator && (
                  <>
                    <div className="ma-confirm-row">
                      <span>Your Stake:</span>
                      <span>{formatUSD(marketData?.stakePerParticipant, marketData?.stakeTokenSymbol)}</span>
                    </div>
                    <div className="ma-confirm-row">
                      <span>Potential Win:</span>
                      <span className="ma-potential-win">
                        {formatUSD(
                          parseFloat(marketData?.stakePerParticipant || 0) * (marketData?.opponentOddsMultiplier || 200) / 100,
                          marketData?.stakeTokenSymbol
                        )}
                      </span>
                    </div>
                  </>
                )}
              </div>
              <div className="ma-actions">
                <button className="ma-btn-secondary" onClick={() => setStep('review')}>
                  Back
                </button>
                <button className="ma-btn-primary" onClick={handleAccept}>
                  I Understand, Accept Offer
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
              <h3>Offer Accepted!</h3>
              <p>
                {isArbitrator
                  ? 'You are now the arbitrator for this wager.'
                  : 'Your stake has been deposited. The wager will activate when all participants have accepted the offer.'}
              </p>
              {txHash && (
                <a
                  href={getTransactionUrl(chainId, txHash)}
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
