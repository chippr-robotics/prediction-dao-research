import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { QRCodeSVG } from 'qrcode.react'
import { useWallet, useWeb3 } from '../../hooks'
import { useEncryption, useDecryptedMarkets } from '../../hooks/useEncryption'
import { TOKENS } from '../../constants/etcswap'
import { getContractAddress } from '../../config/contracts'
import { FRIEND_GROUP_MARKET_FACTORY_ABI } from '../../abis/FriendGroupMarketFactory'
import QRScanner from '../ui/QRScanner'
import MarketAcceptanceModal from './MarketAcceptanceModal'
import './FriendMarketsModal.css'

// Stake token options derived from ETCswap tokens
const STAKE_TOKEN_OPTIONS = [
  { id: 'USC', ...TOKENS.USC, isDefault: true },
  { id: 'WETC', ...TOKENS.WETC },
  { id: 'ETC', ...TOKENS.ETC },
  { id: 'CUSTOM', symbol: 'Custom', name: 'Custom Token', address: '', icon: '🔧' }
]

// Helper to get default end date (7 days from now)
const getDefaultEndDateTime = () => {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  // Format as YYYY-MM-DDTHH:mm for datetime-local input
  return date.toISOString().slice(0, 16)
}

// Helper to get default acceptance deadline (48 hours from now)
const getDefaultAcceptanceDeadline = () => {
  const date = new Date()
  date.setHours(date.getHours() + 48)
  return date.toISOString().slice(0, 16)
}

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

// Helper to get display description from a market (handles encrypted/decrypted metadata)
const getMarketDescription = (market) => {
  // If market has decrypted metadata, use it
  if (market.metadata && market.canView !== false) {
    // Decrypted metadata may have name, description, or question field
    return market.metadata.name || market.metadata.description || market.metadata.question || market.description
  }
  // Fall back to raw description
  return market.description
}

/**
 * FriendMarketsModal Component
 *
 * A dedicated modal for managing friend markets:
 * - Create: Create new friend markets (1v1, Small Group, Event Tracking)
 * - Active: View and manage active friend markets
 * - Past: View completed/resolved friend markets
 *
 * Features QR code generation for sharing after creation
 */
function FriendMarketsModal({
  isOpen,
  onClose,
  onCreate,
  activeMarkets = [],
  pastMarkets = []
}) {
  const { isConnected, account } = useWallet()
  const { signer, isCorrectNetwork, switchNetwork } = useWeb3()

  // Encryption hook for friend market privacy
  const {
    isInitialized: encryptionInitialized,
    isInitializing: encryptionInitializing,
    createEncrypted
  } = useEncryption()

  // Decrypt markets for display
  const { markets: decryptedActiveMarkets } = useDecryptedMarkets(activeMarkets)
  const { markets: decryptedPastMarkets } = useDecryptedMarkets(pastMarkets)

  // Tab state
  const [activeTab, setActiveTab] = useState('create') // 'create', 'active', 'past'

  // Creation flow state
  const [creationStep, setCreationStep] = useState('type') // 'type', 'form', 'success'
  const [friendMarketType, setFriendMarketType] = useState(null)
  const [createdMarket, setCreatedMarket] = useState(null)

  // Form data
  const [formData, setFormData] = useState({
    description: '',
    opponent: '',
    members: '',
    memberLimit: '5',
    endDateTime: getDefaultEndDateTime(),
    stakeAmount: '10',
    stakeTokenId: 'USC', // Default to USC stablecoin
    customStakeTokenAddress: '', // Used when stakeTokenId is 'CUSTOM'
    arbitrator: '',
    peggedMarketId: '',
    // Multi-party acceptance fields
    acceptanceDeadline: getDefaultAcceptanceDeadline(),
    minAcceptanceThreshold: '2' // Minimum participants to activate (including creator)
  })

  // Selected market for detail view
  const [selectedMarket, setSelectedMarket] = useState(null)

  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // QR Scanner state
  const [qrScannerOpen, setQrScannerOpen] = useState(false)
  const [qrScanTarget, setQrScanTarget] = useState(null) // 'opponent' or 'arbitrator'

  // Market lookup state for event tracking
  const [marketLookupId, setMarketLookupId] = useState('')
  const [marketLookupLoading, setMarketLookupLoading] = useState(false)
  const [marketLookupResult, setMarketLookupResult] = useState(null)
  const [marketLookupError, setMarketLookupError] = useState(null)

  // Market acceptance modal state
  const [acceptanceModalOpen, setAcceptanceModalOpen] = useState(false)
  const [marketToAccept, setMarketToAccept] = useState(null)

  // Market cancellation state
  const [cancellingMarketId, setCancellingMarketId] = useState(null)

  // Encryption state
  const [enableEncryption, setEnableEncryption] = useState(true) // Default to encrypted for privacy

  // Reset form function - memoized to prevent stale closures
  const resetForm = useCallback(() => {
    setFormData({
      description: '',
      opponent: '',
      members: '',
      memberLimit: '5',
      endDateTime: getDefaultEndDateTime(),
      stakeAmount: '10',
      stakeTokenId: 'USC',
      customStakeTokenAddress: '',
      arbitrator: '',
      peggedMarketId: '',
      acceptanceDeadline: getDefaultAcceptanceDeadline(),
      minAcceptanceThreshold: '2'
    })
    setErrors({})
    setMarketLookupId('')
    setMarketLookupResult(null)
    setMarketLookupError(null)
    setEnableEncryption(true)
  }, [])

  // Reset modal state when opened
  useEffect(() => {
    if (isOpen) {
      setActiveTab('create')
      setCreationStep('type')
      setFriendMarketType(null)
      setCreatedMarket(null)
      setSelectedMarket(null)
      setErrors({})
      resetForm()
    }
  }, [isOpen, resetForm])

  const handleClose = useCallback(() => {
    if (!submitting) {
      onClose()
    }
  }, [submitting, onClose])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose])

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  // QR Scanner handlers
  const openQrScanner = (target) => {
    setQrScanTarget(target)
    setQrScannerOpen(true)
  }

  const handleQrScanSuccess = (decodedText) => {
    // Try to extract Ethereum address from scanned data
    let address = decodedText
    let isFromTrustedSource = false

    // If it's a URL, try to extract address from path or query
    try {
      const url = new URL(decodedText)
      // Check if URL is from a trusted origin (same origin)
      const trustedOrigins = [window.location.origin]
      isFromTrustedSource = trustedOrigins.some(origin => url.origin === origin)
      
      // Check for address in pathname (e.g., /address/0x...)
      const pathMatch = url.pathname.match(/0x[a-fA-F0-9]{40}/)
      if (pathMatch) {
        address = pathMatch[0]
      } else {
        // Check query params
        const addrParam = url.searchParams.get('address') || url.searchParams.get('addr')
        if (addrParam) address = addrParam
      }
      
      // Warn if from external source
      if (!isFromTrustedSource) {
        const proceed = window.confirm(
          'This QR code contains a URL from an external source. ' +
          'Please verify the address before proceeding. Continue?'
        )
        if (!proceed) {
          setQrScannerOpen(false)
          setQrScanTarget(null)
          return
        }
      }
    } catch {
      // Not a URL, check if it's a raw address
      const addrMatch = decodedText.match(/0x[a-fA-F0-9]{40}/)
      if (addrMatch) {
        address = addrMatch[0]
      }
    }

    // Update the appropriate field
    if (qrScanTarget && /^0x[a-fA-F0-9]{40}$/.test(address)) {
      handleFormChange(qrScanTarget, address)
    }

    setQrScannerOpen(false)
    setQrScanTarget(null)
  }

  const handleQrScannerClose = () => {
    setQrScannerOpen(false)
    setQrScanTarget(null)
  }

  // Market lookup for event tracking
  const handleMarketLookup = async () => {
    if (!marketLookupId.trim()) {
      setMarketLookupError('Please enter a market ID')
      return
    }

    setMarketLookupLoading(true)
    setMarketLookupError(null)
    setMarketLookupResult(null)

    try {
      // TODO: Replace with actual API call or contract query
      // This mock implementation should be replaced with real market lookup functionality
      // Example: const marketData = await fetchMarketById(marketLookupId)
      await new Promise(resolve => setTimeout(resolve, 800))

      // Mock result for demo purposes
      const mockMarket = {
        id: marketLookupId,
        description: 'Sample prediction market for demonstration',
        question: 'Will ETH reach $5000 by end of Q1 2026?',
        totalVolume: '1,234.56',
        participants: 42,
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active'
      }

      setMarketLookupResult(mockMarket)
      handleFormChange('peggedMarketId', marketLookupId)
    } catch (error) {
      console.error('Market lookup error:', error)
      setMarketLookupError('Market not found or unable to fetch details')
    } finally {
      setMarketLookupLoading(false)
    }
  }

  const clearMarketLookup = () => {
    setMarketLookupId('')
    setMarketLookupResult(null)
    setMarketLookupError(null)
    handleFormChange('peggedMarketId', '')
  }

  // Market acceptance handlers
  const handleOpenAcceptanceModal = (market) => {
    // Transform market data to match what MarketAcceptanceModal expects
    const marketData = {
      id: market.id,
      description: market.description,
      creator: market.creator,
      participants: market.participants || [],
      arbitrator: market.arbitrator || null,
      marketType: market.type || 'oneVsOne',
      status: market.status,
      acceptanceDeadline: typeof market.acceptanceDeadline === 'number'
        ? market.acceptanceDeadline
        : new Date(market.acceptanceDeadline).getTime(),
      minAcceptanceThreshold: market.minAcceptanceThreshold || 2,
      stakePerParticipant: market.stakeAmount,
      stakeToken: market.stakeTokenAddress || null,
      stakeTokenSymbol: market.stakeTokenSymbol || 'ETC',
      acceptances: market.acceptances || {},
      acceptedCount: market.acceptedCount || 0
    }

    setMarketToAccept(marketData)
    setAcceptanceModalOpen(true)
  }

  const handleCloseAcceptanceModal = () => {
    setAcceptanceModalOpen(false)
    setMarketToAccept(null)
  }

  const handleMarketAccepted = () => {
    // Refresh data after acceptance - you may want to trigger a parent refresh
    handleCloseAcceptanceModal()
    // Force a refresh by closing and reopening the modal or triggering a data refresh
    window.location.reload()
  }

  // Cancel a pending market (creator only)
  const handleCancelMarket = async (market) => {
    if (!signer || !isCorrectNetwork) {
      window.alert('Please connect your wallet and switch to the correct network')
      return
    }

    const marketId = market.id
    if (marketId === undefined || marketId === null) {
      window.alert('Invalid market ID')
      return
    }

    if (!window.confirm('Cancel this market and refund all stakes? This cannot be undone.')) {
      return
    }

    setCancellingMarketId(marketId)
    try {
      const factoryAddress = getContractAddress('friendGroupMarketFactory')
      const factory = new ethers.Contract(factoryAddress, FRIEND_GROUP_MARKET_FACTORY_ABI, signer)

      console.log('Cancelling market:', marketId)
      const tx = await factory.cancelPendingMarket(marketId)
      console.log('Cancel transaction sent:', tx.hash)

      await tx.wait()
      console.log('Market cancelled successfully')

      window.alert('Market cancelled. Stakes have been refunded.')
      // Refresh to show updated state
      window.location.reload()
    } catch (error) {
      console.error('Error cancelling market:', error)
      let errorMessage = 'Failed to cancel market'
      if (error.reason) {
        errorMessage += `: ${error.reason}`
      } else if (error.message) {
        errorMessage += `: ${error.message}`
      }
      window.alert(errorMessage)
    } finally {
      setCancellingMarketId(null)
    }
  }

  // Check if user can accept a pending market (invited but hasn't accepted yet)
  const canUserAcceptMarket = useCallback((market) => {
    if (!account || market.status !== 'pending_acceptance') return false

    // User must be in participants list
    const isInvited = market.participants?.some(
      p => p.toLowerCase() === account.toLowerCase()
    )

    // User must NOT be the creator (creator has already accepted by creating)
    const isCreator = market.creator?.toLowerCase() === account.toLowerCase()

    // User must not have already accepted
    const hasAccepted = market.acceptances?.[account.toLowerCase()]?.hasAccepted

    return isInvited && !isCreator && !hasAccepted
  }, [account])

  const validateForm = useCallback(() => {
    const newErrors = {}

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    } else if (formData.description.length < 10) {
      newErrors.description = 'Description must be at least 10 characters'
    }

    if (friendMarketType === 'oneVsOne') {
      if (!formData.opponent.trim()) {
        newErrors.opponent = 'Opponent address is required'
      } else if (!/^0x[a-fA-F0-9]{40}$/.test(formData.opponent.trim())) {
        newErrors.opponent = 'Invalid Ethereum address'
      } else if (formData.opponent.toLowerCase() === '0x0000000000000000000000000000000000000000') {
        newErrors.opponent = 'Cannot use the zero address'
      } else if (formData.opponent.toLowerCase() === account?.toLowerCase()) {
        newErrors.opponent = 'Cannot bet against yourself'
      }
    }

    if (friendMarketType === 'smallGroup' || friendMarketType === 'eventTracking') {
      if (!formData.members.trim()) {
        newErrors.members = 'Member addresses are required'
      } else {
        const addresses = formData.members.split(',').map(a => a.trim()).filter(a => a)
        const minMembers = friendMarketType === 'eventTracking' ? 3 : 2
        const maxMembers = 10

        if (addresses.length < minMembers) {
          newErrors.members = `At least ${minMembers} members required`
        } else if (addresses.length > maxMembers) {
          newErrors.members = `Maximum ${maxMembers} members allowed`
        } else {
          // Check for invalid addresses
          for (const addr of addresses) {
            if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
              newErrors.members = `Invalid address: "${addr}"`
              break
            }
            if (addr.toLowerCase() === '0x0000000000000000000000000000000000000000') {
              newErrors.members = 'Cannot use the zero address'
              break
            }
          }
          
          // Check for duplicates
          if (!newErrors.members) {
            const lowerAddresses = addresses.map(a => a.toLowerCase())
            const uniqueAddresses = new Set(lowerAddresses)
            if (uniqueAddresses.size !== addresses.length) {
              newErrors.members = 'Duplicate addresses are not allowed'
            }
            // Check if creator is in the list
            if (account && lowerAddresses.includes(account.toLowerCase())) {
              newErrors.members = 'Cannot include your own address in member list'
            }
          }
        }
      }
    }

    const stake = parseFloat(formData.stakeAmount)
    const selectedToken = STAKE_TOKEN_OPTIONS.find(t => t.id === formData.stakeTokenId)
    if (!formData.stakeAmount || stake <= 0) {
      newErrors.stakeAmount = 'Valid stake amount is required'
    } else if (stake < 0.1) {
      newErrors.stakeAmount = `Minimum stake is 0.1 ${selectedToken?.symbol || 'tokens'}`
    } else if (stake > 1000) {
      newErrors.stakeAmount = `Maximum stake is 1000 ${selectedToken?.symbol || 'tokens'}`
    }

    // Validate custom stake token address if custom token is selected
    if (formData.stakeTokenId === 'CUSTOM') {
      if (!formData.customStakeTokenAddress) {
        newErrors.customStakeTokenAddress = 'Custom token address is required'
      } else if (!/^0x[a-fA-F0-9]{40}$/.test(formData.customStakeTokenAddress)) {
        newErrors.customStakeTokenAddress = 'Invalid token address format'
      }
    }

    // Validate end date/time
    const endDate = new Date(formData.endDateTime)
    const now = new Date()
    const minDate = new Date(now.getTime() + 24 * 60 * 60 * 1000) // At least 1 day from now
    const maxDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) // Max 1 year from now

    if (!formData.endDateTime || isNaN(endDate.getTime())) {
      newErrors.endDateTime = 'Please select a valid end date and time'
    } else if (endDate < minDate) {
      newErrors.endDateTime = 'End date must be at least 1 day from now'
    } else if (endDate > maxDate) {
      newErrors.endDateTime = 'End date must be within 1 year'
    }

    // Validate acceptance deadline
    const acceptanceDeadline = new Date(formData.acceptanceDeadline)
    const minAcceptanceDate = new Date(now.getTime() + 60 * 60 * 1000) // At least 1 hour from now
    const maxAcceptanceDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // Max 30 days from now

    if (!formData.acceptanceDeadline || isNaN(acceptanceDeadline.getTime())) {
      newErrors.acceptanceDeadline = 'Please select a valid acceptance deadline'
    } else if (acceptanceDeadline < minAcceptanceDate) {
      newErrors.acceptanceDeadline = 'Acceptance deadline must be at least 1 hour from now'
    } else if (acceptanceDeadline > maxAcceptanceDate) {
      newErrors.acceptanceDeadline = 'Acceptance deadline must be within 30 days'
    } else if (acceptanceDeadline >= endDate) {
      newErrors.acceptanceDeadline = 'Acceptance deadline must be before market end date'
    }

    // Validate minimum threshold for group markets
    if (friendMarketType === 'smallGroup' || friendMarketType === 'eventTracking') {
      const threshold = parseInt(formData.minAcceptanceThreshold, 10)
      const memberCount = formData.members.split(',').filter(m => m.trim()).length + 1 // +1 for creator
      if (isNaN(threshold) || threshold < 2) {
        newErrors.minAcceptanceThreshold = 'Minimum threshold must be at least 2'
      } else if (threshold > memberCount) {
        newErrors.minAcceptanceThreshold = `Threshold cannot exceed total participants (${memberCount})`
      }
    }

    if (formData.arbitrator) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(formData.arbitrator.trim())) {
        newErrors.arbitrator = 'Invalid arbitrator address'
      } else if (formData.arbitrator.toLowerCase() === '0x0000000000000000000000000000000000000000') {
        newErrors.arbitrator = 'Cannot use the zero address'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData, friendMarketType, account])

  const handleSelectType = (type) => {
    setFriendMarketType(type)
    setCreationStep('form')
    resetForm()
  }

  const handleBackToType = () => {
    setCreationStep('type')
    setFriendMarketType(null)
    resetForm()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!isConnected) {
      setErrors({ submit: 'Please connect your wallet to continue' })
      return
    }

    if (!isCorrectNetwork) {
      setErrors({ submit: 'Please switch to the correct network' })
      return
    }

    if (!validateForm()) return

    setSubmitting(true)
    try {
      // Get the stake token info for submission
      const getStakeTokenInfo = () => {
        if (formData.stakeTokenId === 'CUSTOM') {
          return {
            symbol: 'Custom',
            address: formData.customStakeTokenAddress,
            icon: '🔧',
            decimals: 18 // Default to 18 for custom tokens
          }
        }
        const token = STAKE_TOKEN_OPTIONS.find(t => t.id === formData.stakeTokenId)
        return token || STAKE_TOKEN_OPTIONS[0] // Default to USC if not found
      }
      const stakeToken = getStakeTokenInfo()

      // Prepare market metadata for encryption
      const marketMetadata = {
        name: formData.description,
        description: formData.description,
        marketType: friendMarketType,
        stakeAmount: formData.stakeAmount,
        stakeToken: stakeToken.symbol,
        endDateTime: formData.endDateTime,
        arbitrator: formData.arbitrator || null,
        createdAt: new Date().toISOString(),
        attributes: [
          { trait_type: 'Market Source', value: 'friend' },
          { trait_type: 'Market Type', value: friendMarketType }
        ]
      }

      // Handle encryption if enabled
      let finalMetadata = marketMetadata
      let creatorSignatureForSharing = null

      if (enableEncryption && friendMarketType === 'oneVsOne') {
        // For 1v1 markets, create encrypted envelope
        // Creator's envelope - participants will be added when they accept
        const { envelope, creatorSignature } = await createEncrypted(marketMetadata)
        finalMetadata = envelope
        creatorSignatureForSharing = creatorSignature
      } else if (enableEncryption && (friendMarketType === 'smallGroup' || friendMarketType === 'eventTracking')) {
        // For group markets, start with creator as only recipient
        // Other participants will be added as they accept and provide signatures
        const { envelope, creatorSignature } = await createEncrypted(marketMetadata)
        finalMetadata = envelope
        creatorSignatureForSharing = creatorSignature
      }

      // Build submit data with token address for WalletButton
      const submitData = {
        type: 'friend',
        marketType: friendMarketType,
        data: {
          ...formData,
          // Pass actual token address so WalletButton can use correct decimals
          // 'native' means native ETC (no ERC20 address), pass null for this case
          collateralToken: stakeToken.address === 'native' ? null : (stakeToken.address || null),
          // Include encrypted metadata and creator's signature for participant key exchange
          encryptedMetadata: enableEncryption ? finalMetadata : null,
          creatorSignature: creatorSignatureForSharing,
          isEncrypted: enableEncryption
        }
      }

      const result = await onCreate(submitData, signer)

      // Calculate trading period in days for display
      const endDate = new Date(formData.endDateTime)
      const now = new Date()
      const tradingPeriodDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      // Calculate acceptance deadline info
      const acceptanceDeadline = new Date(formData.acceptanceDeadline)
      const minThreshold = friendMarketType === 'oneVsOne'
        ? 2
        : parseInt(formData.minAcceptanceThreshold, 10) || 2

      // Created market with acceptance flow fields
      const newMarket = {
        id: result?.id || `friend-${Date.now()}`,
        type: friendMarketType,
        description: formData.description,
        stakeAmount: formData.stakeAmount,
        stakeTokenId: formData.stakeTokenId,
        stakeTokenSymbol: stakeToken.symbol,
        stakeTokenIcon: stakeToken.icon,
        stakeTokenAddress: stakeToken.address,
        endDateTime: formData.endDateTime,
        endDate: endDate.toISOString(),
        tradingPeriod: tradingPeriodDays,
        participants: friendMarketType === 'oneVsOne'
          ? [account, formData.opponent]
          : [account, ...formData.members.split(',').map(a => a.trim())],
        creator: account,
        arbitrator: formData.arbitrator || null,
        createdAt: new Date().toISOString(),
        status: 'pending_acceptance',
        // Acceptance flow fields
        acceptanceDeadline: acceptanceDeadline.getTime(),
        acceptanceDeadlineFormatted: acceptanceDeadline.toISOString(),
        minAcceptanceThreshold: minThreshold,
        acceptedCount: 1, // Creator has accepted
        acceptances: {
          [account.toLowerCase()]: {
            hasAccepted: true,
            stakedAmount: formData.stakeAmount,
            isArbitrator: false
          }
        },
        // Encryption fields
        isEncrypted: enableEncryption,
        creatorSignature: creatorSignatureForSharing
      }

      setCreatedMarket(newMarket)
      setCreationStep('success')
    } catch (error) {
      console.error('Error creating friend market:', error)
      setErrors({ submit: error.message || 'Failed to create market. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateAnother = () => {
    setCreationStep('type')
    setFriendMarketType(null)
    setCreatedMarket(null)
    resetForm()
  }

  const handleMarketSelect = (market) => {
    setSelectedMarket(market)
  }

  const handleBackToList = () => {
    setSelectedMarket(null)
  }

  // Generate market acceptance URL for QR code
  const getMarketUrl = (market) => {
    if (!market?.id) return `${window.location.origin}/friend-market/preview`

    // Build acceptance URL with parameters for offline preview
    const params = new URLSearchParams({
      marketId: market.id,
      creator: market.creator || account || '',
      stake: market.stakeAmount || '0',
      token: market.stakeTokenSymbol || 'ETC',
      deadline: market.acceptanceDeadline ? new Date(market.acceptanceDeadline).getTime().toString() : ''
    })

    return `${window.location.origin}/friend-market/accept?${params.toString()}`
  }

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return 'N/A'
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  // Format address for display
  const formatAddress = (address) => {
    if (!address) return 'N/A'
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // Get type label
  const getTypeLabel = (type) => {
    switch (type) {
      case 'oneVsOne': return '1v1'
      case 'smallGroup': return 'Group'
      case 'eventTracking': return 'Event'
      default: return type
    }
  }

  // Get status badge class
  const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'status-active'
      case 'pending': return 'status-pending'
      case 'resolved': return 'status-resolved'
      case 'won': return 'status-won'
      case 'lost': return 'status-lost'
      default: return 'status-default'
    }
  }

  // Get selected stake token info for display
  const selectedStakeToken = useMemo(() => {
    const token = STAKE_TOKEN_OPTIONS.find(t => t.id === formData.stakeTokenId)
    if (formData.stakeTokenId === 'CUSTOM' && formData.customStakeTokenAddress) {
      return {
        ...token,
        displayAddress: formData.customStakeTokenAddress
      }
    }
    return token
  }, [formData.stakeTokenId, formData.customStakeTokenAddress])

  // Helper to check if user is a participant/creator
  const isUserInMarket = useCallback((market) => {
    if (!account) return false
    const userAddr = account.toLowerCase()
    return market.participants?.some(p => p.toLowerCase() === userAddr) ||
           market.creator?.toLowerCase() === userAddr
  }, [account])

  // Filter markets where user is participating
  // Note: Show markets even if canView is false (encrypted), as long as user is a participant
  // They should see these markets with "encrypted" placeholder to prompt acceptance
  const userActiveMarkets = useMemo(() => {
    return decryptedActiveMarkets.filter(m =>
      isUserInMarket(m) && m.status !== 'pending_acceptance'
    )
  }, [decryptedActiveMarkets, isUserInMarket])

  // Filter pending markets awaiting acceptance
  const userPendingMarkets = useMemo(() => {
    return decryptedActiveMarkets.filter(m =>
      isUserInMarket(m) && m.status === 'pending_acceptance'
    )
  }, [decryptedActiveMarkets, isUserInMarket])

  const userPastMarkets = useMemo(() => {
    return decryptedPastMarkets.filter(m => isUserInMarket(m))
  }, [decryptedPastMarkets, isUserInMarket])

  if (!isOpen) return null

  return (
    <div
      className="friend-markets-modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="friend-markets-modal-title"
    >
      <div className="friend-markets-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="fm-header">
          <div className="fm-header-content">
            <div className="fm-brand">
              <span className="fm-brand-icon">&#127808;</span>
              <h2 id="friend-markets-modal-title">Friend Markets</h2>
            </div>
            <p className="fm-subtitle">Private prediction markets with friends</p>
          </div>
          <button
            className="fm-close-btn"
            onClick={handleClose}
            disabled={submitting}
            aria-label="Close modal"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </header>

        {/* Tab Navigation */}
        <nav className="fm-tabs" role="tablist">
          <button
            className={`fm-tab ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => { setActiveTab('create'); setSelectedMarket(null) }}
            role="tab"
            aria-selected={activeTab === 'create'}
            aria-controls="panel-create"
            disabled={submitting}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v8M8 12h8"/>
            </svg>
            <span>Create</span>
          </button>
          <button
            className={`fm-tab ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => { setActiveTab('active'); setSelectedMarket(null) }}
            role="tab"
            aria-selected={activeTab === 'active'}
            aria-controls="panel-active"
            disabled={submitting}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
            <span>Active</span>
            {(userActiveMarkets.length + userPendingMarkets.length) > 0 && (
              <span className="fm-tab-badge">{userActiveMarkets.length + userPendingMarkets.length}</span>
            )}
          </button>
          <button
            className={`fm-tab ${activeTab === 'past' ? 'active' : ''}`}
            onClick={() => { setActiveTab('past'); setSelectedMarket(null) }}
            role="tab"
            aria-selected={activeTab === 'past'}
            aria-controls="panel-past"
            disabled={submitting}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>Past</span>
          </button>
        </nav>

        {/* Content Area */}
        <div className="fm-content">
          {/* Create Tab */}
          {activeTab === 'create' && (
            <div id="panel-create" role="tabpanel" className="fm-panel">
              {/* Type Selection Step */}
              {creationStep === 'type' && (
                <div className="fm-type-selection">
                  <h3 className="fm-section-title">Choose Market Type</h3>
                  <div className="fm-type-grid">
                    <button
                      className="fm-type-card"
                      onClick={() => handleSelectType('oneVsOne')}
                      type="button"
                    >
                      <div className="fm-type-icon">&#127919;</div>
                      <div className="fm-type-info">
                        <h4>1 vs 1</h4>
                        <p>Head-to-head bet with a friend</p>
                      </div>
                      <svg className="fm-type-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                    <button
                      className="fm-type-card"
                      onClick={() => handleSelectType('smallGroup')}
                      type="button"
                    >
                      <div className="fm-type-icon">&#128106;</div>
                      <div className="fm-type-info">
                        <h4>Small Group</h4>
                        <p>Pool predictions with 2-10 friends</p>
                      </div>
                      <svg className="fm-type-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                    <button
                      className="fm-type-card"
                      onClick={() => handleSelectType('eventTracking')}
                      type="button"
                    >
                      <div className="fm-type-icon">&#127942;</div>
                      <div className="fm-type-info">
                        <h4>Event Tracking</h4>
                        <p>Competitive predictions for events</p>
                      </div>
                      <svg className="fm-type-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Form Step */}
              {creationStep === 'form' && (
                <form className="fm-form" onSubmit={handleSubmit}>
                  <div className="fm-form-header">
                    <button
                      type="button"
                      className="fm-back-btn"
                      onClick={handleBackToType}
                      disabled={submitting}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 18 9 12 15 6"/>
                      </svg>
                      Back
                    </button>
                    <div className="fm-form-type-badge">
                      {friendMarketType === 'oneVsOne' && '&#127919; 1v1'}
                      {friendMarketType === 'smallGroup' && '&#128106; Group'}
                      {friendMarketType === 'eventTracking' && '&#127942; Event'}
                    </div>
                  </div>

                  <div className="fm-form-grid">
                    <div className="fm-form-group fm-form-full">
                      <label htmlFor="fm-description">
                        What&apos;s the bet? <span className="fm-required">*</span>
                      </label>
                      <input
                        id="fm-description"
                        type="text"
                        value={formData.description}
                        onChange={(e) => handleFormChange('description', e.target.value)}
                        placeholder="e.g., Patriots win the Super Bowl"
                        disabled={submitting}
                        className={errors.description ? 'error' : ''}
                        maxLength={200}
                      />
                      {errors.description && <span className="fm-error">{errors.description}</span>}
                    </div>

                    {friendMarketType === 'oneVsOne' && (
                      <div className="fm-form-group fm-form-full">
                        <label htmlFor="fm-opponent">
                          Opponent Address <span className="fm-required">*</span>
                        </label>
                        <div className="fm-input-with-action">
                          <input
                            id="fm-opponent"
                            type="text"
                            value={formData.opponent}
                            onChange={(e) => handleFormChange('opponent', e.target.value)}
                            placeholder="0x..."
                            disabled={submitting}
                            className={errors.opponent ? 'error' : ''}
                          />
                          <button
                            type="button"
                            className="fm-scan-btn"
                            onClick={() => openQrScanner('opponent')}
                            disabled={submitting}
                            title="Scan QR code"
                            aria-label="Scan QR code"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="3" width="7" height="7"/>
                              <rect x="14" y="3" width="7" height="7"/>
                              <rect x="3" y="14" width="7" height="7"/>
                              <rect x="14" y="14" width="3" height="3"/>
                              <path d="M17 14h4v4h-4zM14 17v4h4"/>
                            </svg>
                          </button>
                        </div>
                        {errors.opponent && <span className="fm-error">{errors.opponent}</span>}
                      </div>
                    )}

                    {(friendMarketType === 'smallGroup' || friendMarketType === 'eventTracking') && (
                      <div className="fm-form-group fm-form-full">
                        <label htmlFor="fm-members">
                          Member Addresses <span className="fm-required">*</span>
                        </label>
                        <input
                          id="fm-members"
                          type="text"
                          value={formData.members}
                          onChange={(e) => handleFormChange('members', e.target.value)}
                          placeholder="0x123..., 0x456..., 0x789..."
                          disabled={submitting}
                          className={errors.members ? 'error' : ''}
                        />
                        <span className="fm-hint">
                          Comma-separated ({friendMarketType === 'eventTracking' ? '3-10' : '2-10'} members)
                        </span>
                        {errors.members && <span className="fm-error">{errors.members}</span>}
                      </div>
                    )}

                    <div className="fm-form-group">
                      <label htmlFor="fm-stake">
                        Stake Amount <span className="fm-required">*</span>
                      </label>
                      <div className="fm-stake-input-wrapper">
                        {(formData.stakeTokenId === 'USC' || formData.stakeTokenId === 'CUSTOM') && (
                          <span className="fm-stake-prefix">$</span>
                        )}
                        <input
                          id="fm-stake"
                          type="number"
                          value={formData.stakeAmount}
                          onChange={(e) => handleFormChange('stakeAmount', e.target.value)}
                          placeholder={formData.stakeTokenId === 'USC' ? '10.00' : '10'}
                          min="0.1"
                          max="1000"
                          step="0.01"
                          disabled={submitting}
                          className={`${errors.stakeAmount ? 'error' : ''} ${formData.stakeTokenId === 'USC' ? 'fm-stake-usd' : ''}`}
                        />
                        {formData.stakeTokenId !== 'USC' && formData.stakeTokenId !== 'CUSTOM' && (
                          <span className="fm-stake-suffix">{selectedStakeToken?.symbol || 'ETC'}</span>
                        )}
                      </div>
                      <span className="fm-hint">
                        {formData.stakeTokenId === 'USC'
                          ? 'Enter amount in USD (e.g., 10.00 for $10)'
                          : `Enter amount in ${selectedStakeToken?.symbol || 'tokens'}`}
                      </span>
                      {errors.stakeAmount && <span className="fm-error">{errors.stakeAmount}</span>}
                    </div>

                    <div className="fm-form-group">
                      <label htmlFor="fm-stake-token">
                        Stake Token
                      </label>
                      <select
                        id="fm-stake-token"
                        value={formData.stakeTokenId}
                        onChange={(e) => handleFormChange('stakeTokenId', e.target.value)}
                        disabled={submitting}
                        className="fm-token-select"
                      >
                        {STAKE_TOKEN_OPTIONS.map(token => (
                          <option key={token.id} value={token.id}>
                            {token.icon} {token.symbol} - {token.name}
                          </option>
                        ))}
                      </select>
                      <span className="fm-hint">
                        {formData.stakeTokenId === 'ETC'
                          ? 'Native ETC will be used for stakes'
                          : formData.stakeTokenId === 'CUSTOM'
                          ? 'Enter custom token address below'
                          : `${selectedStakeToken?.name} from ETCswap`}
                      </span>
                    </div>

                    {/* Custom token address input - only shown when CUSTOM is selected */}
                    {formData.stakeTokenId === 'CUSTOM' && (
                      <div className="fm-form-group fm-form-full">
                        <label htmlFor="fm-custom-token">
                          Custom Token Address <span className="fm-required">*</span>
                        </label>
                        <input
                          id="fm-custom-token"
                          type="text"
                          value={formData.customStakeTokenAddress}
                          onChange={(e) => handleFormChange('customStakeTokenAddress', e.target.value)}
                          placeholder="0x..."
                          disabled={submitting}
                          className={errors.customStakeTokenAddress ? 'error' : ''}
                        />
                        <span className="fm-hint">Enter a valid ERC-20 token address</span>
                        {errors.customStakeTokenAddress && <span className="fm-error">{errors.customStakeTokenAddress}</span>}
                      </div>
                    )}

                    <div className="fm-form-group">
                      <label htmlFor="fm-end-date">
                        End Date & Time <span className="fm-required">*</span>
                      </label>
                      <input
                        id="fm-end-date"
                        type="datetime-local"
                        value={formData.endDateTime}
                        onChange={(e) => handleFormChange('endDateTime', e.target.value)}
                        min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
                        max={new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
                        disabled={submitting}
                        className={`fm-datetime-input ${errors.endDateTime ? 'error' : ''}`}
                      />
                      <span className="fm-hint">When does this market end? (min: 1 day, max: 1 year)</span>
                      {errors.endDateTime && <span className="fm-error">{errors.endDateTime}</span>}
                    </div>

                    {/* Acceptance Deadline - for multi-party acceptance flow */}
                    <div className="fm-form-group">
                      <label htmlFor="fm-acceptance-deadline">
                        Acceptance Deadline <span className="fm-required">*</span>
                      </label>
                      <input
                        id="fm-acceptance-deadline"
                        type="datetime-local"
                        value={formData.acceptanceDeadline}
                        onChange={(e) => handleFormChange('acceptanceDeadline', e.target.value)}
                        min={new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16)}
                        max={new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
                        disabled={submitting}
                        className={`fm-datetime-input ${errors.acceptanceDeadline ? 'error' : ''}`}
                      />
                      <span className="fm-hint">How long do participants have to accept? (min: 1 hour, max: 30 days)</span>
                      {errors.acceptanceDeadline && <span className="fm-error">{errors.acceptanceDeadline}</span>}
                    </div>

                    {/* Minimum Threshold - only for group markets */}
                    {(friendMarketType === 'smallGroup' || friendMarketType === 'eventTracking') && (
                      <div className="fm-form-group">
                        <label htmlFor="fm-min-threshold">
                          Minimum Participants to Activate
                        </label>
                        <input
                          id="fm-min-threshold"
                          type="number"
                          value={formData.minAcceptanceThreshold}
                          onChange={(e) => handleFormChange('minAcceptanceThreshold', e.target.value)}
                          min="2"
                          max={Math.max(2, formData.members.split(',').filter(m => m.trim()).length + 1)}
                          disabled={submitting}
                          className={errors.minAcceptanceThreshold ? 'error' : ''}
                        />
                        <span className="fm-hint">Market activates when this many participants accept (including you)</span>
                        {errors.minAcceptanceThreshold && <span className="fm-error">{errors.minAcceptanceThreshold}</span>}
                      </div>
                    )}

                    <div className="fm-form-group fm-form-full">
                      <label htmlFor="fm-arbitrator">
                        Arbitrator (Optional)
                      </label>
                      <div className="fm-input-with-action">
                        <input
                          id="fm-arbitrator"
                          type="text"
                          value={formData.arbitrator}
                          onChange={(e) => handleFormChange('arbitrator', e.target.value)}
                          placeholder="0x... (trusted third party)"
                          disabled={submitting}
                          className={errors.arbitrator ? 'error' : ''}
                        />
                        <button
                          type="button"
                          className="fm-scan-btn"
                          onClick={() => openQrScanner('arbitrator')}
                          disabled={submitting}
                          title="Scan QR code"
                          aria-label="Scan QR code"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7"/>
                            <rect x="14" y="3" width="7" height="7"/>
                            <rect x="3" y="14" width="7" height="7"/>
                            <rect x="14" y="14" width="3" height="3"/>
                            <path d="M17 14h4v4h-4zM14 17v4h4"/>
                          </svg>
                        </button>
                      </div>
                      {errors.arbitrator && <span className="fm-error">{errors.arbitrator}</span>}
                    </div>

                    {/* Privacy / Encryption Toggle */}
                    <div className="fm-form-group fm-form-full">
                      <div className="fm-encryption-toggle">
                        <label className="fm-toggle-label">
                          <input
                            type="checkbox"
                            checked={enableEncryption}
                            onChange={(e) => setEnableEncryption(e.target.checked)}
                            disabled={submitting}
                          />
                          <span className="fm-toggle-switch"></span>
                          <span className="fm-toggle-text">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                              <path d="M7 11V7a5 5 0 0110 0v4"/>
                            </svg>
                            Encrypt Market Details
                          </span>
                        </label>
                        <span className="fm-hint">
                          {enableEncryption
                            ? 'Only participants can view market details. Recommended for private bets.'
                            : 'Market details will be publicly visible on IPFS.'}
                        </span>
                        {enableEncryption && !encryptionInitialized && !encryptionInitializing && (
                          <div className="fm-encryption-warning">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10"/>
                              <path d="M12 16v-4M12 8h.01"/>
                            </svg>
                            <span>You&apos;ll be asked to sign a message to enable encryption</span>
                          </div>
                        )}
                        {encryptionInitializing && (
                          <div className="fm-encryption-status">
                            <span className="fm-spinner-small"></span>
                            <span>Initializing encryption...</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Market Lookup for Event Tracking */}
                    {friendMarketType === 'eventTracking' && (
                      <div className="fm-form-group fm-form-full">
                        <label htmlFor="fm-market-lookup">
                          Peg to Existing Market (Optional)
                        </label>
                        <div className="fm-market-lookup">
                          <div className="fm-input-with-action">
                            <input
                              id="fm-market-lookup"
                              type="text"
                              value={marketLookupId}
                              onChange={(e) => setMarketLookupId(e.target.value)}
                              placeholder="Enter market ID to look up..."
                              disabled={submitting || marketLookupLoading}
                            />
                            <button
                              type="button"
                              className="fm-lookup-btn"
                              onClick={handleMarketLookup}
                              disabled={submitting || marketLookupLoading || !marketLookupId.trim()}
                              title="Look up market"
                            >
                              {marketLookupLoading ? (
                                <span className="fm-spinner-small"></span>
                              ) : (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="11" cy="11" r="8"/>
                                  <path d="M21 21l-4.35-4.35"/>
                                </svg>
                              )}
                            </button>
                          </div>
                          {marketLookupError && (
                            <span className="fm-error">{marketLookupError}</span>
                          )}
                          {marketLookupResult && (
                            <div className="fm-lookup-result">
                              <div className="fm-lookup-result-header">
                                <span className="fm-lookup-result-title">Found Market</span>
                                <button
                                  type="button"
                                  className="fm-lookup-clear"
                                  onClick={clearMarketLookup}
                                  title="Clear selection"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12"/>
                                  </svg>
                                </button>
                              </div>
                              <div className="fm-lookup-result-content">
                                <p className="fm-lookup-question">{marketLookupResult.question || marketLookupResult.description}</p>
                                <div className="fm-lookup-meta">
                                  <span>ID: {marketLookupResult.id}</span>
                                  <span>&#8226;</span>
                                  <span>{marketLookupResult.participants} participants</span>
                                  <span>&#8226;</span>
                                  <span className={`fm-lookup-status fm-lookup-status-${marketLookupResult.status}`}>
                                    {marketLookupResult.status}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Network Warning */}
                  {isConnected && !isCorrectNetwork && (
                    <div className="fm-warning">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      <div>
                        <strong>Wrong Network</strong>
                        <button type="button" onClick={switchNetwork}>Switch Network</button>
                      </div>
                    </div>
                  )}

                  {/* Submit Error */}
                  {errors.submit && (
                    <div className="fm-error-banner">{errors.submit}</div>
                  )}

                  {/* Actions */}
                  <div className="fm-form-actions">
                    <button
                      type="button"
                      className="fm-btn-secondary"
                      onClick={handleBackToType}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="fm-btn-primary"
                      disabled={submitting || !isConnected || !isCorrectNetwork}
                    >
                      {submitting ? (
                        <>
                          <span className="fm-spinner"></span>
                          Creating...
                        </>
                      ) : (
                        'Create Market'
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Success Step with QR Code */}
              {creationStep === 'success' && createdMarket && (
                <div className="fm-success">
                  <div className="fm-success-icon">&#9989;</div>
                  <h3>Market Created!</h3>
                  <p className="fm-success-desc">{createdMarket.description}</p>

                  <div className="fm-qr-section">
                    <div className="fm-qr-container">
                      <QRCodeSVG
                        value={getMarketUrl(createdMarket)}
                        size={180}
                        level="H"
                        includeMargin={false}
                        fgColor="#36B37E"
                        bgColor="transparent"
                        aria-label="QR code to share this market"
                        imageSettings={{
                          src: '/assets/logo_fairwins.svg',
                          height: 32,
                          width: 32,
                          excavate: true,
                        }}
                      />
                    </div>
                    <p className="fm-qr-hint">
                      Share this QR code with participants to accept the market
                    </p>
                    <div className="fm-acceptance-info">
                      <span className="fm-acceptance-status">&#9203; Waiting for acceptance</span>
                      {createdMarket.acceptanceDeadline && (
                        <span className="fm-acceptance-deadline">
                          Deadline: {new Date(createdMarket.acceptanceDeadline).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="fm-qr-url">
                      <label htmlFor="fm-market-url">Acceptance link</label>
                      <input
                        id="fm-market-url"
                        type="text"
                        value={getMarketUrl(createdMarket)}
                        readOnly
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                  </div>

                  <div className="fm-success-details">
                    <div className="fm-detail-row">
                      <span>Status</span>
                      <span className="fm-status-pending">Pending Acceptance</span>
                    </div>
                    <div className="fm-detail-row">
                      <span>Privacy</span>
                      <span className={`fm-privacy-badge ${createdMarket.isEncrypted ? 'fm-private' : 'fm-public'}`}>
                        {createdMarket.isEncrypted ? (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                              <path d="M7 11V7a5 5 0 0110 0v4"/>
                            </svg>
                            Encrypted
                          </>
                        ) : 'Public'}
                      </span>
                    </div>
                    <div className="fm-detail-row">
                      <span>Type</span>
                      <span>{getTypeLabel(createdMarket.type)}</span>
                    </div>
                    <div className="fm-detail-row">
                      <span>Stake Required</span>
                      <span>
                        {createdMarket.stakeTokenIcon} {formatUSD(createdMarket.stakeAmount, createdMarket.stakeTokenSymbol)}
                      </span>
                    </div>
                    {createdMarket.acceptanceDeadline && (
                      <div className="fm-detail-row">
                        <span>Accept By</span>
                        <span>{new Date(createdMarket.acceptanceDeadline).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="fm-detail-row">
                      <span>Market Ends</span>
                      <span>{createdMarket.endDateTime ? new Date(createdMarket.endDateTime).toLocaleString() : `${createdMarket.tradingPeriod} days`}</span>
                    </div>
                    {createdMarket.arbitrator && (
                      <div className="fm-detail-row">
                        <span>Arbitrator</span>
                        <span>{formatAddress(createdMarket.arbitrator)}</span>
                      </div>
                    )}
                  </div>

                  <div className="fm-success-actions">
                    <button
                      type="button"
                      className="fm-btn-secondary"
                      onClick={handleCreateAnother}
                    >
                      Create Another
                    </button>
                    <button
                      type="button"
                      className="fm-btn-primary"
                      onClick={async () => {
                        const url = getMarketUrl(createdMarket)
                        if (!navigator.clipboard || !navigator.clipboard.writeText) {
                          window.alert('Copy to clipboard is not supported in this browser. Please copy the link manually.')
                          return
                        }
                        try {
                          await navigator.clipboard.writeText(url)
                          window.alert('Link copied to clipboard.')
                        } catch (error) {
                          console.error('Failed to copy link to clipboard:', error)
                          window.alert('Failed to copy the link. Please copy it manually.')
                        }
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                      </svg>
                      Copy Link
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Active Markets Tab */}
          {activeTab === 'active' && (
            <div id="panel-active" role="tabpanel" className="fm-panel">
              {selectedMarket ? (
                <MarketDetailView
                  market={selectedMarket}
                  onBack={handleBackToList}
                  formatDate={formatDate}
                  formatAddress={formatAddress}
                  getTypeLabel={getTypeLabel}
                  getStatusClass={getStatusClass}
                  account={account}
                />
              ) : (
                <>
                  {/* Pending Markets Section */}
                  {userPendingMarkets.length > 0 && (
                    <div className="fm-pending-section">
                      <h4 className="fm-section-title">
                        <span className="fm-pending-icon">&#9203;</span>
                        Awaiting Acceptance ({userPendingMarkets.length})
                      </h4>
                      <div className="fm-pending-list">
                        {userPendingMarkets.map((market, index) => (
                          <div key={`pending-${market.uniqueId || `${market.contractAddress || 'local'}-${market.id}`}-${index}`} className="fm-pending-card">
                            <div className="fm-pending-header">
                              <span className="fm-pending-type">{getTypeLabel(market.type)}</span>
                              <span className="fm-pending-badge">Pending</span>
                            </div>
                            <p className="fm-pending-desc">{getMarketDescription(market)}</p>
                            <div className="fm-pending-progress">
                              <div className="fm-progress-bar">
                                <div
                                  className="fm-progress-fill"
                                  style={{
                                    width: `${((market.acceptedCount || 0) / (market.minAcceptanceThreshold || 2)) * 100}%`
                                  }}
                                />
                              </div>
                              <span className="fm-progress-text">
                                {market.acceptedCount || 0}/{market.minAcceptanceThreshold || 2} accepted
                              </span>
                            </div>
                            <div className="fm-pending-info">
                              <span className="fm-pending-stake">
                                {formatUSD(market.stakeAmount, market.stakeTokenSymbol)}
                              </span>
                              {market.acceptanceDeadline && (
                                <span className="fm-pending-deadline">
                                  Deadline: {new Date(market.acceptanceDeadline).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            <div className="fm-pending-actions">
                              {/* Accept button for invited participants */}
                              {canUserAcceptMarket(market) && (
                                <button
                                  type="button"
                                  className="fm-btn-accept"
                                  onClick={() => handleOpenAcceptanceModal(market)}
                                >
                                  Accept & Stake
                                </button>
                              )}
                              <button
                                type="button"
                                className="fm-btn-outline"
                                onClick={() => {
                                  const url = getMarketUrl(market)
                                  if (navigator.clipboard?.writeText) {
                                    navigator.clipboard.writeText(url)
                                      .then(() => window.alert('Link copied!'))
                                      .catch(() => window.alert('Failed to copy'))
                                  }
                                }}
                              >
                                &#128279; Copy Link
                              </button>
                              {market.creator?.toLowerCase() === account?.toLowerCase() && (
                                <button
                                  type="button"
                                  className="fm-btn-danger-outline"
                                  onClick={() => handleCancelMarket(market)}
                                  disabled={cancellingMarketId === market.id}
                                >
                                  {cancellingMarketId === market.id ? 'Cancelling...' : 'Cancel'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Active Markets Section */}
                  {userActiveMarkets.length === 0 && userPendingMarkets.length === 0 ? (
                    <div className="fm-empty-state">
                      <div className="fm-empty-icon">&#128200;</div>
                      <h3>No Active Markets</h3>
                      <p>You don&apos;t have any active friend markets yet.</p>
                      <button
                        type="button"
                        className="fm-btn-primary"
                        onClick={() => setActiveTab('create')}
                      >
                        Create Your First Market
                      </button>
                    </div>
                  ) : userActiveMarkets.length > 0 && (
                    <>
                      {userPendingMarkets.length > 0 && (
                        <h4 className="fm-section-title fm-active-title">
                          <span>&#128200;</span>
                          Active Markets ({userActiveMarkets.length})
                        </h4>
                      )}
                      <div className="fm-markets-list">
                        <MarketsCompactTable
                          markets={userActiveMarkets}
                          onSelect={handleMarketSelect}
                          formatDate={formatDate}
                          formatAddress={formatAddress}
                          getTypeLabel={getTypeLabel}
                          getStatusClass={getStatusClass}
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Past Markets Tab */}
          {activeTab === 'past' && (
            <div id="panel-past" role="tabpanel" className="fm-panel">
              {selectedMarket ? (
                <MarketDetailView
                  market={selectedMarket}
                  onBack={handleBackToList}
                  formatDate={formatDate}
                  formatAddress={formatAddress}
                  getTypeLabel={getTypeLabel}
                  getStatusClass={getStatusClass}
                  account={account}
                />
              ) : (
                <>
                  {userPastMarkets.length === 0 ? (
                    <div className="fm-empty-state">
                      <div className="fm-empty-icon">&#128203;</div>
                      <h3>No Past Markets</h3>
                      <p>Completed markets will appear here.</p>
                    </div>
                  ) : (
                    <div className="fm-markets-list">
                      <MarketsCompactTable
                        markets={userPastMarkets}
                        onSelect={handleMarketSelect}
                        formatDate={formatDate}
                        formatAddress={formatAddress}
                        getTypeLabel={getTypeLabel}
                        getStatusClass={getStatusClass}
                        isPast
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* QR Scanner Modal */}
      <QRScanner
        isOpen={qrScannerOpen}
        onClose={handleQrScannerClose}
        onScanSuccess={handleQrScanSuccess}
      />

      {/* Market Acceptance Modal */}
      {acceptanceModalOpen && marketToAccept && (
        <MarketAcceptanceModal
          isOpen={acceptanceModalOpen}
          onClose={handleCloseAcceptanceModal}
          marketId={marketToAccept.id}
          marketData={marketToAccept}
          onAccepted={handleMarketAccepted}
          contractAddress={getContractAddress('friendGroupMarketFactory')}
          contractABI={FRIEND_GROUP_MARKET_FACTORY_ABI}
        />
      )}
    </div>
  )
}

/**
 * Compact table component for displaying markets
 */
function MarketsCompactTable({
  markets,
  onSelect,
  formatDate,
  getTypeLabel,
  getStatusClass,
  isPast = false
}) {
  return (
    <table className="fm-table" role="table">
      <thead>
        <tr>
          <th>Description</th>
          <th>Type</th>
          <th>Stake</th>
          <th>{isPast ? 'Result' : 'Ends'}</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {markets.map((market, index) => (
          <tr
            key={`market-${market.uniqueId || `${market.contractAddress || 'local'}-${market.id}`}-${index}`}
            onClick={() => onSelect(market)}
            className="fm-table-row"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onSelect(market) }}
          >
            <td className="fm-table-desc">
              <span className="fm-table-desc-text">
                {market.isPrivate && (
                  <svg
                    className="fm-privacy-icon"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    title="Encrypted market"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                )}
                {getMarketDescription(market)}
              </span>
            </td>
            <td>
              <span className="fm-type-badge">{getTypeLabel(market.type)}</span>
            </td>
            <td className="fm-table-stake">
              {market.stakeTokenIcon || '💵'} {formatUSD(market.stakeAmount, market.stakeTokenSymbol)}
            </td>
            <td className="fm-table-date">
              {isPast
                ? (market.outcome || 'Resolved')
                : formatDate(market.endDate)
              }
            </td>
            <td>
              <span className={`fm-status-badge ${getStatusClass(market.status)}`}>
                {market.status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Market detail view component
 */
function MarketDetailView({
  market,
  onBack,
  formatDate,
  formatAddress,
  getTypeLabel,
  getStatusClass,
  account
}) {
  const isCreator = market.creator?.toLowerCase() === account?.toLowerCase()
  const marketUrl = `${window.location.origin}/friend-market/${market.id}`

  return (
    <div className="fm-detail">
      <button type="button" className="fm-back-btn" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to list
      </button>

      <div className="fm-detail-header">
        <h3>
          {market.isPrivate && (
            <svg
              className="fm-privacy-icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              title="Encrypted market"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          )}
          {getMarketDescription(market)}
        </h3>
        <span className={`fm-status-badge ${getStatusClass(market.status)}`}>
          {market.status}
        </span>
      </div>

      <div className="fm-detail-grid">
        {market.isPrivate && (
          <div className="fm-detail-item">
            <span className="fm-detail-label">Privacy</span>
            <span className="fm-detail-value fm-privacy-badge fm-private">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              Encrypted
            </span>
          </div>
        )}
        <div className="fm-detail-item">
          <span className="fm-detail-label">Type</span>
          <span className="fm-detail-value">{getTypeLabel(market.type)}</span>
        </div>
        <div className="fm-detail-item">
          <span className="fm-detail-label">Stake</span>
          <span className="fm-detail-value">
            {market.stakeTokenIcon || '💵'} {formatUSD(market.stakeAmount, market.stakeTokenSymbol)}
          </span>
        </div>
        <div className="fm-detail-item">
          <span className="fm-detail-label">Total Pool</span>
          <span className="fm-detail-value">
            {market.stakeTokenIcon || '💵'} {formatUSD(parseFloat(market.stakeAmount || 0) * (market.participants?.length || 2), market.stakeTokenSymbol)}
          </span>
        </div>
        <div className="fm-detail-item">
          <span className="fm-detail-label">Created</span>
          <span className="fm-detail-value">{formatDate(market.createdAt)}</span>
        </div>
        <div className="fm-detail-item">
          <span className="fm-detail-label">Ends</span>
          <span className="fm-detail-value">{formatDate(market.endDate)}</span>
        </div>
        <div className="fm-detail-item">
          <span className="fm-detail-label">Participants</span>
          <span className="fm-detail-value">{market.participants?.length || 0}</span>
        </div>
      </div>

      {market.participants && market.participants.length > 0 && (
        <div className="fm-detail-participants">
          <span className="fm-detail-label">Participants</span>
          <div className="fm-participants-list">
            {market.participants.map((participant, idx) => (
              <div key={idx} className="fm-participant">
                <span className="fm-participant-addr">{formatAddress(participant)}</span>
                {participant.toLowerCase() === market.creator?.toLowerCase() && (
                  <span className="fm-participant-tag">Creator</span>
                )}
                {participant.toLowerCase() === account?.toLowerCase() && (
                  <span className="fm-participant-tag fm-you">You</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {market.arbitrator && (
        <div className="fm-detail-arbitrator">
          <span className="fm-detail-label">Arbitrator</span>
          <span className="fm-detail-value">{formatAddress(market.arbitrator)}</span>
        </div>
      )}

      <div className="fm-detail-qr">
        <QRCodeSVG
          value={marketUrl}
          size={120}
          level="M"
          fgColor="#36B37E"
          bgColor="transparent"
          aria-label="QR code to share this market"
        />
        <p>Share this market</p>
      </div>

      <div className="fm-detail-actions">
        <button
          type="button"
          className="fm-btn-secondary"
          onClick={async () => {
            if (!navigator.clipboard || !navigator.clipboard.writeText) {
              window.alert('Copy to clipboard is not supported in this browser. Please copy the link manually.')
              return
            }
            try {
              await navigator.clipboard.writeText(marketUrl)
              window.alert('Link copied to clipboard.')
            } catch (error) {
              console.error('Failed to copy link to clipboard:', error)
              window.alert('Failed to copy the link. Please copy it manually.')
            }
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          Copy Link
        </button>
        {isCreator && market.status === 'active' && (
          <button type="button" className="fm-btn-primary">
            Resolve Market
          </button>
        )}
      </div>
    </div>
  )
}

export default FriendMarketsModal
