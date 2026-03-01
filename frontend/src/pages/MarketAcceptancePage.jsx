import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { ethers } from 'ethers'
import { useWallet, useWeb3 } from '../hooks'
import MarketAcceptanceModal from '../components/fairwins/MarketAcceptanceModal'
import { FRIEND_GROUP_MARKET_FACTORY_ABI } from '../abis/FriendGroupMarketFactory'
import { getContractAddress } from '../config/contracts'
import { ETCSWAP_ADDRESSES } from '../constants/etcswap'
import { WAGER_DEFAULTS } from '../constants/wagerDefaults'
import './MarketAcceptancePage.css'

/**
 * Determine token symbol based on token address
 */
function getTokenSymbol(tokenAddress) {
  if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
    return 'ETC'
  }
  const addr = tokenAddress.toLowerCase()
  if (addr === ETCSWAP_ADDRESSES.USC_STABLECOIN?.toLowerCase()) {
    return 'USC'
  }
  if (addr === ETCSWAP_ADDRESSES.WETC?.toLowerCase()) {
    return 'WETC'
  }
  return 'tokens'
}

/**
 * Get decimal places for a token
 */
function getTokenDecimals(tokenAddress) {
  if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
    return 18
  }
  const addr = tokenAddress.toLowerCase()
  if (addr === ETCSWAP_ADDRESSES.USC_STABLECOIN?.toLowerCase()) {
    return 6 // USC has 6 decimals
  }
  return 18
}

/**
 * Check if a description is an encrypted JSON envelope
 */
function isEncryptedDescription(description) {
  if (!description || typeof description !== 'string') return false
  try {
    const parsed = JSON.parse(description)
    return parsed.version && parsed.algorithm && parsed.content
  } catch {
    return false
  }
}

/**
 * MarketAcceptancePage
 *
 * Deep link handler for market acceptance QR codes.
 * Route: /friend-market/accept?marketId=X&...
 *
 * Fetches market data from the contract and displays the acceptance modal.
 */
function MarketAcceptancePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { provider } = useWeb3()
  useWallet() // For wallet state subscription

  const [marketData, setMarketData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const marketId = searchParams.get('marketId')

  // Also get any data passed via URL params for offline preview
  const urlCreator = searchParams.get('creator')
  const urlStake = searchParams.get('stake')
  const urlToken = searchParams.get('token')
  const urlDeadline = searchParams.get('deadline')

  useEffect(() => {
    const fetchMarketData = async () => {
      if (!marketId) {
        setError('No wager ID provided')
        setLoading(false)
        return
      }

      // If we have a provider, try to fetch from contract
      if (provider) {
        try {
          setLoading(true)
          const contractAddress = getContractAddress('friendGroupMarketFactory')

          if (!contractAddress) {
            throw new Error('Contract address not configured')
          }

          const contract = new ethers.Contract(
            contractAddress,
            FRIEND_GROUP_MARKET_FACTORY_ABI,
            provider
          )

          // Fetch market details with status
          const marketResult = await contract.getFriendMarketWithStatus(marketId)
          const acceptanceStatus = await contract.getAcceptanceStatus(marketId)

          // Also fetch full market details to get createdAt
          const fullMarketResult = await contract.getFriendMarket(marketId)

          // Try to get tradingPeriodSeconds from contract if available
          // Note: This requires the getTradingPeriod getter to be added to the contract
          let tradingPeriodSeconds = null
          try {
            tradingPeriodSeconds = await contract.getTradingPeriod(marketId)
            tradingPeriodSeconds = Number(tradingPeriodSeconds)
          } catch {
            // Getter not available yet, will try to parse from metadata
          }

          // Fetch individual acceptances
          const acceptances = {}
          const members = marketResult.members || []

          for (const member of members) {
            try {
              const record = await contract.getParticipantAcceptance(marketId, member)
              acceptances[member.toLowerCase()] = {
                hasAccepted: record.hasAccepted,
                stakedAmount: ethers.formatEther(record.stakedAmount),
                isArbitrator: record.isArbitrator
              }
            } catch {
              // Member not found, skip
            }
          }

          // Check arbitrator if exists
          const arbitrator = marketResult.arbitrator
          if (arbitrator && arbitrator !== ethers.ZeroAddress) {
            try {
              const arbRecord = await contract.getParticipantAcceptance(marketId, arbitrator)
              acceptances[arbitrator.toLowerCase()] = {
                hasAccepted: arbRecord.hasAccepted,
                stakedAmount: '0',
                isArbitrator: true
              }
            } catch {
              // Arbitrator not found, skip
            }
          }

          // Map market type enum to string
          const marketTypes = ['oneVsOne', 'smallGroup', 'eventTracking', 'propBet']
          const statusNames = ['pending_acceptance', 'active', 'resolved', 'cancelled', 'refunded']

          // Determine token info
          const stakeTokenAddr = marketResult.stakeToken
          const tokenSymbol = getTokenSymbol(stakeTokenAddr)
          const tokenDecimals = getTokenDecimals(stakeTokenAddr)

          // Format stake amount with correct decimals
          const stakeAmount = ethers.formatUnits(marketResult.stakePerParticipant, tokenDecimals)

          // Get resolution type and odds from contract
          const resolutionType = Number(marketResult.resolutionType)
          const opponentOddsMultiplier = Number(marketResult.opponentOddsMultiplier)

          // Handle encrypted descriptions - show placeholder instead of JSON
          const rawDescription = marketResult.description
          const displayDescription = isEncryptedDescription(rawDescription)
            ? 'Encrypted Wager (details visible to participants)'
            : rawDescription

          // Get createdAt from full market result
          const createdAt = Number(fullMarketResult.createdAt) * 1000
          const acceptanceDeadlineMs = Number(marketResult.acceptanceDeadline) * 1000

          // Try to extract market end date from encrypted metadata if available
          let estimatedMarketEndDate = null
          let tradingPeriodFromMetadata = null

          if (isEncryptedDescription(rawDescription)) {
            try {
              const envelope = JSON.parse(rawDescription)
              // The endDateTime might be in the encrypted content, which we can't read here
              // But we store it in attributes for display purposes
              if (envelope.attributes) {
                const endDateAttr = envelope.attributes.find(a => a.trait_type === 'End Date')
                if (endDateAttr) {
                  estimatedMarketEndDate = new Date(endDateAttr.value).getTime()
                }
              }
            } catch {
              // Could not parse metadata
            }
          }

          // If we got tradingPeriodSeconds from contract, use it
          if (tradingPeriodSeconds) {
            // For pending markets, estimate end date as when they might activate + trading period
            // Best estimate: acceptance deadline + trading period
            estimatedMarketEndDate = acceptanceDeadlineMs + (tradingPeriodSeconds * 1000)
          } else if (!estimatedMarketEndDate) {
            // Fallback: acceptance deadline + 7 days default
            estimatedMarketEndDate = acceptanceDeadlineMs + (7 * 24 * 60 * 60 * 1000)
          }

          setMarketData({
            id: marketId,
            description: displayDescription,
            rawDescription: rawDescription, // Keep original for decryption
            isEncrypted: isEncryptedDescription(rawDescription),
            creator: marketResult.creator,
            participants: members,
            arbitrator: arbitrator !== ethers.ZeroAddress ? arbitrator : null,
            marketType: marketTypes[Number(marketResult.marketType)] || 'unknown',
            status: statusNames[Number(marketResult.status)] || 'unknown',
            acceptanceDeadline: acceptanceDeadlineMs,
            minAcceptanceThreshold: Number(marketResult.minThreshold),
            stakePerParticipant: stakeAmount,
            stakeToken: stakeTokenAddr,
            stakeTokenSymbol: tokenSymbol,
            acceptances,
            acceptedCount: Number(acceptanceStatus.accepted),
            opponentOddsMultiplier,
            resolutionType,
            // Add market end date info
            createdAt,
            tradingPeriodSeconds: tradingPeriodSeconds || tradingPeriodFromMetadata,
            estimatedMarketEndDate
          })

        } catch (err) {
          console.error('Error fetching market from contract:', err)

          // Fall back to URL params if available
          if (urlCreator && urlStake) {
            setMarketData({
              id: marketId,
              description: 'Offer details will load when connected...',
              creator: urlCreator,
              participants: [],
              arbitrator: null,
              marketType: 'unknown',
              status: 'pending_acceptance',
              acceptanceDeadline: urlDeadline ? Number(urlDeadline) : Date.now() + 86400000,
              minAcceptanceThreshold: WAGER_DEFAULTS.MIN_ACCEPTANCE_THRESHOLD,
              stakePerParticipant: urlStake,
              stakeToken: null,
              stakeTokenSymbol: urlToken || 'tokens',
              acceptances: {},
              acceptedCount: 0
            })
          } else {
            setError('Failed to load offer data. Please ensure you are connected to the correct network.')
          }
        }
      } else {
        // No provider, use URL params if available
        if (urlCreator && urlStake) {
          setMarketData({
            id: marketId,
            description: 'Connect wallet to view full offer details',
            creator: urlCreator,
            participants: [],
            arbitrator: null,
            marketType: 'unknown',
            status: 'pending_acceptance',
            acceptanceDeadline: urlDeadline ? Number(urlDeadline) : Date.now() + 86400000,
            minAcceptanceThreshold: 2,
            stakePerParticipant: urlStake,
            stakeToken: null,
            stakeTokenSymbol: urlToken || 'tokens',
            acceptances: {},
            acceptedCount: 0
          })
        } else {
          setError('Please connect your wallet to view offer details')
        }
      }

      setLoading(false)
    }

    fetchMarketData()
  }, [marketId, provider, urlCreator, urlStake, urlToken, urlDeadline])

  const handleClose = () => {
    navigate('/')
  }

  const handleAccepted = () => {
    // Refresh market data after acceptance
    setLoading(true)
    window.location.reload()
  }

  if (loading) {
    return (
      <div className="map-loading">
        <div className="map-spinner"></div>
        <p>Loading offer details...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="map-error">
        <div className="map-error-icon">&#9888;</div>
        <h2>Unable to Load Offer</h2>
        <p>{error}</p>
        <button className="map-btn" onClick={handleClose}>
          Go Back
        </button>
      </div>
    )
  }

  return (
    <div className="map-container">
      <MarketAcceptanceModal
        isOpen={true}
        onClose={handleClose}
        marketId={marketId}
        marketData={marketData}
        onAccepted={handleAccepted}
        contractAddress={getContractAddress('friendGroupMarketFactory')}
        contractABI={FRIEND_GROUP_MARKET_FACTORY_ABI}
      />
    </div>
  )
}

export default MarketAcceptancePage
