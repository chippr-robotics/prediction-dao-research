import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { ethers } from 'ethers'
import { useWallet, useWeb3 } from '../hooks'
import MarketAcceptanceModal from '../components/fairwins/MarketAcceptanceModal'
import { FRIEND_GROUP_MARKET_FACTORY_ABI } from '../abis/FriendGroupMarketFactory'
import { CONTRACT_ADDRESSES } from '../constants/contracts'
import './MarketAcceptancePage.css'

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
        setError('No market ID provided')
        setLoading(false)
        return
      }

      // If we have a provider, try to fetch from contract
      if (provider) {
        try {
          setLoading(true)
          const contractAddress = CONTRACT_ADDRESSES.friendGroupMarketFactory

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

          setMarketData({
            id: marketId,
            description: marketResult.description,
            creator: marketResult.creator,
            participants: members,
            arbitrator: arbitrator !== ethers.ZeroAddress ? arbitrator : null,
            marketType: marketTypes[Number(marketResult.marketType)] || 'unknown',
            status: statusNames[Number(marketResult.status)] || 'unknown',
            acceptanceDeadline: Number(marketResult.acceptanceDeadline) * 1000,
            minAcceptanceThreshold: Number(marketResult.minThreshold),
            stakePerParticipant: ethers.formatEther(marketResult.stakePerParticipant),
            stakeToken: marketResult.stakeToken,
            stakeTokenSymbol: 'ETC', // TODO: Fetch token symbol dynamically
            acceptances,
            acceptedCount: Number(acceptanceStatus.accepted)
          })

        } catch (err) {
          console.error('Error fetching market from contract:', err)

          // Fall back to URL params if available
          if (urlCreator && urlStake) {
            setMarketData({
              id: marketId,
              description: 'Market details will load when connected...',
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
            setError('Failed to load market data. Please ensure you are connected to the correct network.')
          }
        }
      } else {
        // No provider, use URL params if available
        if (urlCreator && urlStake) {
          setMarketData({
            id: marketId,
            description: 'Connect wallet to view full market details',
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
          setError('Please connect your wallet to view market details')
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
        <p>Loading market details...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="map-error">
        <div className="map-error-icon">&#9888;</div>
        <h2>Unable to Load Market</h2>
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
        contractAddress={CONTRACT_ADDRESSES.friendGroupMarketFactory}
        contractABI={FRIEND_GROUP_MARKET_FACTORY_ABI}
      />
    </div>
  )
}

export default MarketAcceptancePage
