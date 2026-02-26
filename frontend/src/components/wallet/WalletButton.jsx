import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { ethers } from 'ethers'
import { useETCswap } from '../../hooks/useETCswap'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useWalletRoles, useWeb3 } from '../../hooks'
import { useRoleDetails } from '../../hooks/useRoleDetails'
import { useTheme } from '../../hooks/useTheme'
import { useModal } from '../../hooks/useUI'
import { ROLES, ROLE_INFO } from '../../contexts/RoleContext'
import { getContractAddress } from '../../config/contracts'
import { MARKET_FACTORY_ABI, BetType, TradingPeriod, ERC20_ABI } from '../../abis/ConditionalMarketFactory'
import { FRIEND_GROUP_MARKET_FACTORY_ABI } from '../../abis/FriendGroupMarketFactory'
import { ETCSWAP_ADDRESSES, TOKENS } from '../../constants/etcswap'
import {
  isCorrelationRegistryDeployed,
  createCorrelationGroup,
  addMarketToCorrelationGroup,
  getUserTierOnChain,
  hasRoleOnChain,
  checkRoleSyncNeeded,
  fetchFriendMarketsForUser
} from '../../utils/blockchainService'
import {
  uploadMarketMetadata,
  uploadEncryptedEnvelope,
  buildEncryptedIpfsReference
} from '../../utils/ipfsService'
import BlockiesAvatar from '../ui/BlockiesAvatar'
import PremiumPurchaseModal from '../ui/PremiumPurchaseModal'
import MarketCreationModal from '../fairwins/MarketCreationModal'
import { RoleDetailsSection } from './RoleDetailsCard'
import walletIcon from '../../assets/wallet_no_text.svg'
import { FriendMarketsModal, MyMarketsModal } from '../fairwins'
import './WalletButton.css'
import './RoleDetailsCard.css'

/**
 * WalletButton Component
 * 
 * A neutral, non-third-party wallet connection button that uses wagmi hooks directly.
 * Provides a clean, professional interface similar to RainbowKit's design philosophy.
 * 
 * Features:
 * - Uses assets/wallet_no_text.svg icon for wallet access
 * - Displays account info when connected
 * - Shows connector options when disconnected
 * - Integrates with existing modal system for user management
 */
// Helper to load friend markets from localStorage
const loadFriendMarketsFromStorage = () => {
  try {
    const stored = localStorage.getItem('friendMarkets')
    return stored ? JSON.parse(stored) : []
  } catch (e) {
    console.warn('Failed to load friend markets from storage:', e)
    return []
  }
}

// Helper to save friend markets to localStorage
const saveFriendMarketsToStorage = (markets) => {
  try {
    localStorage.setItem('friendMarkets', JSON.stringify(markets))
  } catch (e) {
    console.warn('Failed to save friend markets to storage:', e)
  }
}

// Helper to track pending transactions for resume capability
const PENDING_TX_KEY = 'pendingFriendMarketTx'

const savePendingTransaction = (txData) => {
  try {
    localStorage.setItem(PENDING_TX_KEY, JSON.stringify({
      ...txData,
      timestamp: Date.now()
    }))
  } catch (e) {
    console.warn('Failed to save pending transaction:', e)
  }
}

const loadPendingTransaction = () => {
  try {
    const stored = localStorage.getItem(PENDING_TX_KEY)
    if (!stored) return null
    const data = JSON.parse(stored)
    // Expire pending transactions after 1 hour
    if (Date.now() - data.timestamp > 60 * 60 * 1000) {
      clearPendingTransaction()
      return null
    }
    return data
  } catch (e) {
    console.warn('Failed to load pending transaction:', e)
    return null
  }
}

const clearPendingTransaction = () => {
  try {
    localStorage.removeItem(PENDING_TX_KEY)
  } catch (e) {
    console.warn('Failed to clear pending transaction:', e)
  }
}

function WalletButton({ className = '' }) {
  const [isOpen, setIsOpen] = useState(false)
  const [showFriendMarketModal, setShowFriendMarketModal] = useState(false)
  const [showMarketCreationModal, setShowMarketCreationModal] = useState(false)
  const [showMyMarketsModal, setShowMyMarketsModal] = useState(false)
  const [friendMarkets, setFriendMarkets] = useState(() => loadFriendMarketsFromStorage())
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const navigate = useNavigate()
  const { showModal } = useModal()
  const { balances, loading: balanceLoading } = useETCswap()
  const { preferences, setDemoMode } = useUserPreferences()
  const { hasRole, rolesLoading, refreshRoles } = useWalletRoles()
  const {
    roleDetails,
    loading: roleDetailsLoading,
    refresh: refreshRoleDetails
  } = useRoleDetails()
  const { signer } = useWeb3()
  const { toggleMode, isDark } = useTheme()
  const dropdownRef = useRef(null)
  const buttonRef = useRef(null)
  const [connectorStatus, setConnectorStatus] = useState({})
  const [isCheckingConnectors, setIsCheckingConnectors] = useState(true)
  const [pendingConnector, setPendingConnector] = useState(null)

  // Fetch friend markets from blockchain when user connects
  useEffect(() => {
    if (!address || !isConnected) return

    const fetchBlockchainMarkets = async () => {
      try {
        console.log('[WalletButton] Fetching friend markets from blockchain for:', address)
        const blockchainMarkets = await fetchFriendMarketsForUser(address)
        console.log('[WalletButton] Fetched friend markets:', blockchainMarkets.length)

        if (blockchainMarkets.length > 0) {
          // Use blockchain as source of truth - deduplicate by id
          // Add uniqueId combining contract address and id for stable React keys
          const marketsWithUniqueIds = blockchainMarkets.map(m => ({
            ...m,
            uniqueId: `${m.contractAddress || 'unknown'}-${m.id}`
          }))

          setFriendMarkets(() => {
            // Prefer blockchain data over localStorage
            saveFriendMarketsToStorage(marketsWithUniqueIds)
            return marketsWithUniqueIds
          })
        }
      } catch (error) {
        console.error('[WalletButton] Error fetching friend markets from blockchain:', error)
      }
    }

    fetchBlockchainMarkets()
  }, [address, isConnected])

  // Filter friend markets into active and past based on end date and user
  const { activeFriendMarkets, pastFriendMarkets } = useMemo(() => {
    const now = new Date()
    const userAddr = address?.toLowerCase()

    // Filter markets for current user
    const userMarkets = friendMarkets.filter(m =>
      m.creator?.toLowerCase() === userAddr ||
      m.participants?.some(p => p.toLowerCase() === userAddr)
    )

    // Markets that are ended, resolved, or cancelled go to past
    const isPastMarket = (m) => {
      const endDate = new Date(m.endDate)
      const status = m.status?.toLowerCase()
      return endDate <= now ||
             status === 'resolved' ||
             status === 'cancelled' ||
             status === 'canceled'
    }

    const active = userMarkets.filter(m => !isPastMarket(m))
    const past = userMarkets.filter(m => isPastMarket(m))

    return { activeFriendMarkets: active, pastFriendMarkets: past }
  }, [friendMarkets, address])

  // Check connector availability on mount and when connectors change
  useEffect(() => {
    const checkConnectors = async () => {
      setIsCheckingConnectors(true)
      const status = {}
      
      for (const connector of connectors) {
        try {
          // For injected connectors, check if provider is available
          if (connector.type === 'injected') {
            // Check if there's an injected provider available
            const hasProvider = typeof window !== 'undefined' && (
              window.ethereum !== undefined ||
              window.web3 !== undefined
            )
            status[connector.id] = hasProvider
          } else if (connector.type === 'walletConnect') {
            // WalletConnect is always available (it uses QR code / deep links)
            status[connector.id] = true
          } else {
            // For other connectors, try to get provider
            try {
              const provider = await connector.getProvider()
              status[connector.id] = !!provider
            } catch {
              status[connector.id] = true // Assume available if we can't check
            }
          }
        } catch (error) {
          console.warn(`Error checking connector ${connector.name}:`, error)
          status[connector.id] = false
        }
      }
      
      setConnectorStatus(status)
      setIsCheckingConnectors(false)
    }
    
    checkConnectors()
  }, [connectors])

  // Helper to check if a connector is available
  const isConnectorAvailable = useCallback((connector) => {
    // WalletConnect is always available
    if (connector.type === 'walletConnect') return true
    // Check our cached status
    return connectorStatus[connector.id] !== false
  }, [connectorStatus])

  // Track previous connection state to detect connection success
  const wasConnected = useRef(isConnected)

  // Close dropdown when connection state changes from disconnected to connected
  // This handles both immediate connections and delayed confirmations
  useEffect(() => {
    // Detect transition from disconnected to connected
    if (!wasConnected.current && isConnected) {
      // Successfully connected - close dropdown and clear pending state
      if (isOpen) {
        setIsOpen(false)
      }
      setPendingConnector(null)
    }
    // Update the ref for next comparison
    wasConnected.current = isConnected
  }, [isConnected, isOpen])

  // Reset pending connector when connection attempt fails
  // Uses a short delay to handle wagmi's async state updates where isConnecting
  // may become false briefly before isConnected becomes true on success
  useEffect(() => {
    if (!isConnecting && pendingConnector && !isConnected) {
      const timeout = setTimeout(() => {
        setPendingConnector(null)
      }, 500)
      return () => clearTimeout(timeout)
    }
  }, [isConnecting, pendingConnector, isConnected])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
        buttonRef.current?.focus()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const toggleDropdown = () => {
    setIsOpen(!isOpen)
  }

  const handleConnect = (connector) => {
    // Track which connector we're trying to connect
    setPendingConnector(connector.id)
    
    // Initiate connection - don't await, don't close dropdown
    // The useEffect watching isConnected will close the dropdown when connected
    connect({ connector }, {
      onError: (error) => {
        console.error('Error connecting wallet with', connector.name, ':', error)
        setPendingConnector(null)
      }
    })
  }

  const handleDisconnect = () => {
    disconnect()
    setIsOpen(false)
  }

  const handleToggleDemoMode = () => {
    setDemoMode(!preferences.demoMode)
  }

  const handleOpenPurchaseModal = (preselectedRole = null, action = 'purchase') => {
    setIsOpen(false)
    showModal(
      <PremiumPurchaseModal
        onClose={() => showModal(null)}
        preselectedRole={preselectedRole}
        action={action}
      />,
      {
        title: '',
        size: 'large',
        closable: false
      }
    )
  }

  const handleUpgradeRole = (roleName) => {
    handleOpenPurchaseModal(roleName, 'upgrade')
  }

  const handleExtendRole = (roleName) => {
    handleOpenPurchaseModal(roleName, 'extend')
  }

  const handleRefreshRoles = async () => {
    await Promise.all([refreshRoles(), refreshRoleDetails()])
  }

  const handleOpenFriendMarket = () => {
    setIsOpen(false)
    setShowFriendMarketModal(true)
  }

  const handleOpenMyMarkets = () => {
    setIsOpen(false)
    setShowMyMarketsModal(true)
  }

  const handleFriendMarketCreation = async (data, modalSigner) => {
    const activeSigner = modalSigner || signer

    if (!activeSigner) {
      console.error('No signer available for friend market creation')
      throw new Error('Please connect your wallet to create a market')
    }

    console.log('Friend market creation data:', data)

    // Progress callback for UI updates
    const onProgress = data.data?.onProgress || (() => {})

    // Save initial pending state for recovery
    savePendingTransaction({
      step: 'verify',
      data: {
        description: data.data?.description,
        opponent: data.data?.opponent,
        stakeAmount: data.data?.stakeAmount,
        stakeTokenId: data.data?.stakeTokenId,
        tradingPeriod: data.data?.tradingPeriod,
        acceptanceDeadline: data.data?.acceptanceDeadline
      }
    })

    try {
      onProgress({ step: 'verify', message: 'Checking membership status...' })

      // Use FriendGroupMarketFactory for friend markets (not ConditionalMarketFactory)
      const friendFactoryAddress = getContractAddress('friendGroupMarketFactory')
      if (!friendFactoryAddress) {
        throw new Error('FriendGroupMarketFactory not deployed on this network')
      }

      // Get stake token address - use form data or default to USC stablecoin
      // null/undefined means native ETC, which uses ZeroAddress in the contract
      const rawCollateralToken = data.data?.collateralToken
      const isNativeETC = rawCollateralToken === null || rawCollateralToken === undefined
      const stakeTokenAddress = isNativeETC ? ethers.ZeroAddress : (rawCollateralToken || ETCSWAP_ADDRESSES.USC_STABLECOIN)

      // Determine token decimals based on token address
      // USC has 6 decimals, native ETC and most others have 18
      let tokenDecimals = 18
      if (!isNativeETC && stakeTokenAddress.toLowerCase() === ETCSWAP_ADDRESSES.USC_STABLECOIN.toLowerCase()) {
        tokenDecimals = TOKENS.USC.decimals  // 6 decimals for USC
      }

      console.log('Stake token config:', {
        rawCollateralToken,
        isNativeETC,
        stakeTokenAddress,
        tokenDecimals
      })

      const friendFactory = new ethers.Contract(friendFactoryAddress, FRIEND_GROUP_MARKET_FACTORY_ABI, activeSigner)
      const stakeToken = isNativeETC ? null : new ethers.Contract(stakeTokenAddress, ERC20_ABI, activeSigner)
      const userAddress = await activeSigner.getAddress()

      // Check if user has FRIEND_MARKET role (checks both TierRegistry AND RoleManager)
      let hasFriendMarketRole = false
      try {
        // First check TierRegistry for tier info
        const friendMarketTier = await getUserTierOnChain(userAddress, 'FRIEND_MARKET')
        console.log('TierRegistry FRIEND_MARKET tier:', friendMarketTier)
        if (friendMarketTier.tier > 0) {
          hasFriendMarketRole = true
          console.log('User has FRIEND_MARKET role via TierRegistry (tier', friendMarketTier.tierName + ')')
        }
      } catch (tierError) {
        console.debug('TierRegistry check failed:', tierError.message)
      }

      // If not found in TierRegistry, check RoleManager as fallback
      if (!hasFriendMarketRole) {
        try {
          const hasRoleInManager = await hasRoleOnChain(userAddress, 'FRIEND_MARKET')
          if (hasRoleInManager) {
            hasFriendMarketRole = true
            console.log('User has FRIEND_MARKET role via RoleManager (legacy)')
          }
        } catch (roleError) {
          console.debug('RoleManager check failed:', roleError.message)
        }
      }

      if (!hasFriendMarketRole) {
        throw new Error('You do not have the Friend Market role. Please purchase Friend Markets access to create markets.')
      }

      // Check if role needs to be synced to TieredRoleManager
      // FriendGroupMarketFactory checks TieredRoleManager, not TierRegistry
      try {
        const syncStatus = await checkRoleSyncNeeded(userAddress, 'FRIEND_MARKET')
        console.log('Role sync status:', syncStatus)

        if (syncStatus.needsSync) {
          throw new Error(
            `Your Friend Market role (${syncStatus.tierName}) needs to be activated in the system. ` +
            `Please contact support or wait for the role to be synced. ` +
            `Your purchase was successful but the role needs admin activation for friend market creation.`
          )
        }
      } catch (syncError) {
        if (syncError.message.includes('needs to be activated')) {
          throw syncError // Re-throw sync errors
        }
        console.debug('Role sync check failed (non-critical):', syncError.message)
      }

      console.log('Friend Market role check passed')

      // Check membership active and market creation limit on TieredRoleManager
      // These are the exact checks the FriendGroupMarketFactory does before allowing market creation
      try {
        // Get the TieredRoleManager address that the FriendGroupMarketFactory is actually using
        const factoryTRMAddress = await friendFactory.tieredRoleManager()
        console.log('FriendGroupMarketFactory tieredRoleManager address:', factoryTRMAddress)

        if (!factoryTRMAddress || factoryTRMAddress === ethers.ZeroAddress) {
          console.warn('FriendGroupMarketFactory has no TieredRoleManager configured')
        } else {
          // Use the TieredRoleManager that the factory is actually using
          const tieredRoleManagerABI = [
            'function FRIEND_MARKET_ROLE() view returns (bytes32)',
            'function isMembershipActive(address user, bytes32 role) view returns (bool)',
            'function checkMarketCreationLimitFor(address user, bytes32 role) returns (bool)',
            'function hasRole(bytes32 role, address account) view returns (bool)'
          ]
          const tieredRoleManager = new ethers.Contract(factoryTRMAddress, tieredRoleManagerABI, activeSigner)

          const friendMarketRole = await tieredRoleManager.FRIEND_MARKET_ROLE()
          console.log('FRIEND_MARKET_ROLE:', friendMarketRole)

          // Check hasRole first
          const hasRole = await tieredRoleManager.hasRole(friendMarketRole, userAddress)
          console.log('hasRole check:', hasRole)
          if (!hasRole) {
            throw new Error('You do not have the Friend Market role in TieredRoleManager. Role may need to be synced.')
          }

          // Check if membership is active (not expired)
          const isActive = await tieredRoleManager.isMembershipActive(userAddress, friendMarketRole)
          console.log('isMembershipActive check:', isActive)
          if (!isActive) {
            throw new Error('Your Friend Market membership has expired. Please renew your membership to create markets.')
          }

          // Check market creation limit (uses staticCall since it modifies state)
          const canCreateMarket = await tieredRoleManager.checkMarketCreationLimitFor.staticCall(userAddress, friendMarketRole)
          console.log('checkMarketCreationLimitFor check:', canCreateMarket)
          if (!canCreateMarket) {
            throw new Error('You have reached your market creation limit for this period. Please wait or upgrade your tier for higher limits.')
          }

          console.log('All TieredRoleManager checks passed')
        }
      } catch (membershipError) {
        if (membershipError.message.includes('expired') ||
            membershipError.message.includes('limit') ||
            membershipError.message.includes('do not have')) {
          throw membershipError
        }
        console.warn('Membership check failed (will try transaction anyway):', membershipError.message)
      }

      // Calculate trading period in seconds
      const tradingPeriodDays = parseInt(data.data.tradingPeriod) || 7
      const tradingPeriodSeconds = tradingPeriodDays * 24 * 60 * 60

      // Check if this is a bookmaker market (requires odds calculation)
      const isBookmaker = data.marketType === 'bookmaker'

      // Parse stake amount using correct decimals for token
      const stakeAmountRaw = data.data.stakeAmount || '10'
      const stakeWei = ethers.parseUnits(stakeAmountRaw, tokenDecimals)

      // Get odds multiplier (only used for bookmaker markets)
      // 200 = 2x equal stakes, 10000 = 100x
      const oddsMultiplier = parseInt(data.data.oddsMultiplier) || 200

      // Get resolution type (0=Either, 1=Initiator, 2=Receiver, 3=ThirdParty, 4=AutoPegged)
      const resolutionType = parseInt(data.data.resolutionType) || 0

      // Calculate stakes based on market type
      let opponentStakeWei
      let creatorStakeWei

      if (isBookmaker) {
        // Bookmaker: asymmetric stakes based on odds
        // stakeAmount = opponent's stake, creator stakes more based on odds
        opponentStakeWei = stakeWei
        creatorStakeWei = (opponentStakeWei * BigInt(oddsMultiplier - 100)) / 100n
      } else {
        // Regular 1v1: equal stakes for both parties
        opponentStakeWei = stakeWei
        creatorStakeWei = stakeWei
      }

      // Validate stake amount and balance before proceeding
      console.log('Stake amount validation:', {
        marketType: data.marketType,
        isBookmaker,
        stakeAmountRaw,
        opponentStakeWei: opponentStakeWei.toString(),
        oddsMultiplier: isBookmaker ? oddsMultiplier : 'N/A (equal stakes)',
        resolutionType,
        creatorStakeWei: creatorStakeWei.toString(),
        creatorStakeFormatted: ethers.formatUnits(creatorStakeWei, tokenDecimals),
        tokenDecimals,
        isNativeETC
      })

      // Check user balance for ERC20 tokens (creator needs to stake creatorStakeWei)
      if (!isNativeETC && stakeToken) {
        const balance = await stakeToken.balanceOf(userAddress)
        const tokenSymbol = TOKENS.USC?.symbol || 'tokens'
        const requiredAmount = ethers.formatUnits(creatorStakeWei, tokenDecimals)
        console.log('Token balance check:', {
          balance: balance.toString(),
          balanceFormatted: ethers.formatUnits(balance, tokenDecimals),
          required: creatorStakeWei.toString(),
          requiredFormatted: requiredAmount
        })
        if (balance < creatorStakeWei) {
          throw new Error(
            `Insufficient ${tokenSymbol} balance. You have ${ethers.formatUnits(balance, tokenDecimals)} but need ${requiredAmount} ${tokenSymbol}.`
          )
        }
      } else if (isNativeETC) {
        // Check native ETC balance (creator needs to stake creatorStakeWei)
        const balance = await activeSigner.provider.getBalance(userAddress)
        const requiredAmount = ethers.formatEther(creatorStakeWei)
        console.log('Native ETC balance check:', {
          balance: balance.toString(),
          balanceFormatted: ethers.formatEther(balance),
          required: creatorStakeWei.toString(),
          requiredFormatted: requiredAmount
        })
        if (balance < creatorStakeWei) {
          throw new Error(
            `Insufficient ETC balance. You have ${ethers.formatEther(balance)} but need ${requiredAmount} ETC.`
          )
        }
      }

      // Calculate acceptance deadline
      // The modal may pass: date string, milliseconds timestamp, seconds timestamp, or hours
      let acceptanceDeadline
      const rawDeadline = data.data.acceptanceDeadline

      if (typeof rawDeadline === 'string' && rawDeadline.includes('-')) {
        // Date string like '2026-01-15T15:44' - parse it
        const parsedDate = new Date(rawDeadline)
        if (!isNaN(parsedDate.getTime())) {
          acceptanceDeadline = Math.floor(parsedDate.getTime() / 1000)
        } else {
          // Invalid date, use default 48 hours
          acceptanceDeadline = Math.floor(Date.now() / 1000) + (48 * 60 * 60)
        }
      } else if (typeof rawDeadline === 'number' && rawDeadline > 1000000000000) {
        // Milliseconds timestamp (13+ digits)
        acceptanceDeadline = Math.floor(rawDeadline / 1000)
      } else if (typeof rawDeadline === 'number' && rawDeadline > 1000000000) {
        // Already in seconds timestamp (10 digits)
        acceptanceDeadline = Math.floor(rawDeadline)
      } else {
        // Treat as hours from now (default 48 hours)
        const hours = parseInt(rawDeadline) || 48
        acceptanceDeadline = Math.floor(Date.now() / 1000) + (hours * 60 * 60)
      }

      console.log('Acceptance deadline calculation:', {
        rawDeadline,
        rawDeadlineType: typeof rawDeadline,
        acceptanceDeadlineSeconds: acceptanceDeadline,
        acceptanceDeadlineDate: new Date(acceptanceDeadline * 1000).toISOString()
      })

      // Get opponent address for 1v1 markets
      const opponent = data.data.opponent || data.data.participants?.[0]
      if (!opponent || opponent === userAddress) {
        throw new Error('Valid opponent address required for 1v1 market')
      }

      // Get arbitrator (optional - can be zero address for no arbitrator)
      const arbitrator = data.data.arbitrator || ethers.ZeroAddress

      // Approve stake token for FriendGroupMarketFactory (only for ERC20 tokens, not native ETC)
      // Creator needs to approve their stake amount (creatorStakeWei)
      if (!isNativeETC && stakeToken) {
        const currentAllowance = await stakeToken.allowance(userAddress, friendFactoryAddress)
        if (currentAllowance < creatorStakeWei) {
          onProgress({ step: 'approve', message: 'Approving token spend...' })
          console.log('Approving stake token for FriendGroupMarketFactory...', {
            creatorStakeWei: creatorStakeWei.toString()
          })
          const approveTx = await stakeToken.approve(friendFactoryAddress, creatorStakeWei)
          onProgress({ step: 'approve', message: 'Waiting for approval confirmation...', txHash: approveTx.hash })
          savePendingTransaction({
            step: 'approve',
            approveTxHash: approveTx.hash,
            data: {
              description: data.data?.description,
              opponent: data.data?.opponent,
              stakeAmount: data.data?.stakeAmount,
              oddsMultiplier: oddsMultiplier
            }
          })
          await approveTx.wait()
          console.log('Stake token approved')
          // Mark approval as complete
          savePendingTransaction({
            step: 'approved',
            approvalComplete: true,
            data: {
              description: data.data?.description,
              opponent: data.data?.opponent,
              stakeAmount: data.data?.stakeAmount,
              oddsMultiplier: oddsMultiplier
            }
          })
        }
      }

      // Determine description: use encrypted envelope if encryption enabled, otherwise plaintext
      // For encrypted markets, upload envelope to IPFS and store only CID on-chain
      // This reduces gas costs and keeps the encrypted data off-chain for better privacy
      let marketDescription
      let _isEncryptedMarket = false
      let ipfsCid = null

      if (data.data.isEncrypted && data.data.encryptedMetadata) {
        _isEncryptedMarket = true

        // Upload encrypted envelope to IPFS via Pinata
        onProgress({ step: 'upload', message: 'Uploading encrypted metadata to IPFS...' })
        try {
          const uploadResult = await uploadEncryptedEnvelope(data.data.encryptedMetadata, {
            marketType: data.marketType || 'oneVsOne'
          })
          ipfsCid = uploadResult.cid
          // Store only the IPFS reference on-chain (much smaller than full envelope)
          // Format: "encrypted:ipfs://CID" for easy detection and parsing
          marketDescription = buildEncryptedIpfsReference(ipfsCid)
          console.log('Encrypted metadata uploaded to IPFS:', {
            cid: ipfsCid,
            onChainRef: marketDescription,
            originalSize: JSON.stringify(data.data.encryptedMetadata).length,
            onChainSize: marketDescription.length,
            savings: `${Math.round((1 - marketDescription.length / JSON.stringify(data.data.encryptedMetadata).length) * 100)}% smaller`
          })
        } catch (uploadError) {
          console.error('Failed to upload encrypted metadata to IPFS:', uploadError)
          throw new Error(`Failed to upload encrypted metadata: ${uploadError.message}. Please check your Pinata configuration.`)
        }
      } else {
        marketDescription = data.data.description || 'Friend Market'
        console.log('Using plaintext description, length:', marketDescription.length, 'chars')
      }

      // Create the 1v1 pending market
      onProgress({ step: 'create', message: 'Creating market on blockchain...' })
      console.log('Creating 1v1 pending market...', {
        opponent,
        description: marketDescription.substring(0, 100) + (marketDescription.length > 100 ? '...' : ''),
        descriptionLength: marketDescription.length,
        isEncrypted: data.data.isEncrypted,
        ipfsCid: ipfsCid || 'N/A (plaintext)',
        tradingPeriodSeconds,
        arbitrator,
        acceptanceDeadline,
        opponentStakeWei: opponentStakeWei.toString(),
        oddsMultiplier,
        creatorStakeWei: creatorStakeWei.toString(),
        stakeToken: stakeTokenAddress,
        isNativeETC
      })

      // For native ETC, send the creator's stake as msg.value; for ERC20, no value needed
      // With IPFS storage, encrypted markets now have small on-chain footprint
      // CID reference is ~60 bytes vs 1000+ bytes for full envelope
      const gasLimit = 1000000n
      let tx

      if (isBookmaker) {
        // Bookmaker market: requires dual roles, supports custom odds
        // createBookmakerMarket(opponent, description, tradingPeriod, acceptanceDeadline,
        //   opponentStakeAmount, opponentOddsMultiplier, stakeToken, resolutionType, arbitrator)
        if (isNativeETC) {
          tx = await friendFactory.createBookmakerMarket(
            opponent,
            marketDescription,
            tradingPeriodSeconds,
            acceptanceDeadline,
            opponentStakeWei,
            oddsMultiplier,
            stakeTokenAddress,
            resolutionType,
            arbitrator,
            { value: creatorStakeWei, gasLimit }
          )
        } else {
          tx = await friendFactory.createBookmakerMarket(
            opponent,
            marketDescription,
            tradingPeriodSeconds,
            acceptanceDeadline,
            opponentStakeWei,
            oddsMultiplier,
            stakeTokenAddress,
            resolutionType,
            arbitrator,
            { gasLimit }
          )
        }
      } else {
        // Regular 1v1 market: equal stakes, no odds multiplier
        // createOneVsOneMarketPending(opponent, description, tradingPeriod, arbitrator,
        //   acceptanceDeadline, stakeAmount, stakeToken, resolutionType)
        if (isNativeETC) {
          tx = await friendFactory.createOneVsOneMarketPending(
            opponent,
            marketDescription,
            tradingPeriodSeconds,
            arbitrator,
            acceptanceDeadline,
            opponentStakeWei,
            stakeTokenAddress,
            resolutionType,
            { value: creatorStakeWei, gasLimit }
          )
        } else {
          tx = await friendFactory.createOneVsOneMarketPending(
            opponent,
            marketDescription,
            tradingPeriodSeconds,
            arbitrator,
            acceptanceDeadline,
            opponentStakeWei,
            stakeTokenAddress,
            resolutionType,
            { gasLimit }
          )
        }
      }

      console.log('Friend market transaction sent:', tx.hash)
      onProgress({ step: 'create', message: 'Waiting for confirmation...', txHash: tx.hash })
      savePendingTransaction({
        step: 'create',
        txHash: tx.hash,
        data: {
          description: data.data?.description,
          opponent: data.data?.opponent,
          stakeAmount: data.data?.stakeAmount,
          marketType: data.marketType,
          oddsMultiplier: isBookmaker ? oddsMultiplier : 200,
          resolutionType: resolutionType
        }
      })
      const receipt = await tx.wait()
      console.log('Friend market created:', receipt)
      onProgress({ step: 'complete', message: 'Market created successfully!', txHash: receipt.hash })
      // Clear pending state on success
      clearPendingTransaction()

      // Extract friendMarketId from event logs
      let friendMarketId = null
      const marketCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = friendFactory.interface.parseLog(log)
          return parsed?.name === 'MarketCreatedPending'
        } catch {
          return false
        }
      })

      if (marketCreatedEvent) {
        const parsed = friendFactory.interface.parseLog(marketCreatedEvent)
        friendMarketId = parsed?.args?.friendMarketId?.toString()
      }

      // Store the friend market for display
      const endDate = new Date(Date.now() + tradingPeriodDays * 24 * 60 * 60 * 1000)

      const newMarket = {
        id: friendMarketId || `friend-${Date.now()}`,
        type: data.marketType || 'oneVsOne',
        description: data.data.description || 'Friend Market', // Always store plaintext for local display
        isEncrypted: data.data.isEncrypted || false,
        encryptedMetadata: data.data.encryptedMetadata || null, // Store envelope for local verification
        ipfsCid: ipfsCid || null, // IPFS CID for encrypted envelope (for fetching/sharing)
        stakeAmount: stakeAmountRaw,
        opponentStake: ethers.formatUnits(opponentStakeWei, tokenDecimals),
        creatorStake: ethers.formatUnits(creatorStakeWei, tokenDecimals),
        oddsMultiplier: isBookmaker ? oddsMultiplier : 200, // 200 = equal stakes for non-bookmaker
        resolutionType: resolutionType,
        tradingPeriod: tradingPeriodDays.toString(),
        participants: [userAddress, opponent],
        opponent: opponent,
        arbitrator: arbitrator,
        creator: userAddress,
        createdAt: new Date().toISOString(),
        acceptanceDeadline: new Date(acceptanceDeadline * 1000).toISOString(),
        endDate: endDate.toISOString(),
        status: 'pending', // Friend markets start as pending until opponent accepts
        txHash: receipt.hash
      }

      // Update state and persist to localStorage
      setFriendMarkets(prev => {
        const updated = [...prev, newMarket]
        saveFriendMarketsToStorage(updated)
        return updated
      })

      console.log('Friend market stored:', newMarket)

      setShowFriendMarketModal(false)

      return {
        id: friendMarketId || `friend-${Date.now()}`,
        txHash: receipt.hash,
        status: 'pending'
      }
    } catch (error) {
      console.error('Error creating friend market:', error)
      throw error
    }
  }

  const handleOpenMarketCreation = () => {
    setIsOpen(false)
    setShowMarketCreationModal(true)
  }

  /**
   * Handle creation from the MarketCreationModal
   * Supports prediction markets with web3 transactions using CTF1155
   *
   * Transaction Flow:
   * 1. Approve collateral token (if needed)
   * 2. Create market on-chain
   * 3. Create correlation group (if new group selected)
   * 4. Add market to correlation group (if correlation enabled)
   */
  const handleMarketCreation = async (submitData, modalSigner, onProgress) => {
    const activeSigner = modalSigner || signer

    // Helper to report progress
    const reportProgress = (step, total, description, status = 'pending') => {
      if (onProgress) {
        onProgress({ step, total, description, status })
      }
      console.log(`[${step}/${total}] ${description} - ${status}`)
    }

    // Calculate total steps based on configuration
    const hasCorrelation = submitData.correlationGroup && isCorrelationRegistryDeployed()
    const isNewGroup = hasCorrelation && submitData.correlationGroup.createNew
    const hasMetadata = submitData.metadata && !submitData.metadataUri
    let totalSteps = 2 // Base: approve + create market
    if (hasMetadata) totalSteps++ // + upload metadata to IPFS
    if (isNewGroup) totalSteps++ // + create group
    if (hasCorrelation) totalSteps++ // + add to group

    if (!activeSigner) {
      console.error('No signer available for market creation')
      throw new Error('Please connect your wallet to create a market')
    }

    // Verify signer is authorized for the connected address
    try {
      const signerAddress = await activeSigner.getAddress()
      console.log('Market creation - Signer address:', signerAddress)
      console.log('Market creation - Connected address:', address)

      if (address && signerAddress.toLowerCase() !== address.toLowerCase()) {
        console.warn('Signer address does not match connected address, reconnecting...')
        // Request accounts to ensure authorization
        if (window.ethereum) {
          await window.ethereum.request({ method: 'eth_requestAccounts' })
        }
      }
    } catch (addressError) {
      console.error('Error verifying signer address:', addressError)
      throw new Error('Wallet authorization failed. Please reconnect your wallet.')
    }

    console.log('Market creation data:', submitData)
    console.log('Collateral token from form:', submitData.collateralToken)

    try {
      const marketFactoryAddress = getContractAddress('marketFactory')
      if (!marketFactoryAddress) {
        throw new Error('Market factory contract not deployed on this network')
      }

      // Get collateral token address - use form data or default to USC stablecoin
      const collateralTokenAddress = submitData.collateralToken || ETCSWAP_ADDRESSES.USC_STABLECOIN
      console.log('Using collateral token:', collateralTokenAddress)
      console.log('USC stablecoin address:', ETCSWAP_ADDRESSES.USC_STABLECOIN)

      if (!collateralTokenAddress) {
        throw new Error('Collateral token not configured')
      }

      // Determine token decimals based on token address
      const tokenDecimals = collateralTokenAddress.toLowerCase() === ETCSWAP_ADDRESSES.USC_STABLECOIN.toLowerCase()
        ? TOKENS.USC.decimals  // 6 decimals for USC
        : 18  // Default to 18 decimals for other tokens

      const contract = new ethers.Contract(marketFactoryAddress, MARKET_FACTORY_ABI, activeSigner)
      const collateralToken = new ethers.Contract(collateralTokenAddress, ERC20_ABI, activeSigner)

      // Pre-flight checks: verify contract is properly configured
      const [ctf1155Address, roleManagerAddress, ownerAddress] = await Promise.all([
        contract.ctf1155(),
        contract.roleManager(),
        contract.owner()
      ])

      const userAddress = await activeSigner.getAddress()

      // Check CTF1155 is configured
      if (ctf1155Address === ethers.ZeroAddress) {
        throw new Error('Market factory not fully configured: CTF1155 contract not set. Contact the contract owner.')
      }

      // Check if user can create markets
      const isOwner = userAddress.toLowerCase() === ownerAddress.toLowerCase()
      let hasMarketMakerRole = false

      // Log role check details for debugging
      console.log('Role check details:', {
        userAddress,
        ownerAddress,
        isOwner,
        roleManagerFromFactory: roleManagerAddress,
        expectedRoleManager: getContractAddress('roleManager')
      })

      if (roleManagerAddress !== ethers.ZeroAddress) {
        // Check on-chain role using the roleManager from factory
        const roleManagerAbi = [
          'function hasRole(bytes32 role, address account) view returns (bool)',
          'function MARKET_MAKER_ROLE() view returns (bytes32)',
          'function isActiveMember(address user, bytes32 role) view returns (bool)',
          'function checkMarketCreationLimitFor(address user, bytes32 role) returns (bool)'
        ]
        const roleManager = new ethers.Contract(roleManagerAddress, roleManagerAbi, activeSigner)
        try {
          const marketMakerRole = await roleManager.MARKET_MAKER_ROLE()
          console.log('MARKET_MAKER_ROLE hash:', marketMakerRole)

          // Try hasRole first
          hasMarketMakerRole = await roleManager.hasRole(marketMakerRole, userAddress)
          console.log('hasRole result:', hasMarketMakerRole)

          // If hasRole fails, try isActiveMember (TieredRoleManager specific)
          if (!hasMarketMakerRole) {
            try {
              const isActive = await roleManager.isActiveMember(userAddress, marketMakerRole)
              console.log('isActiveMember result:', isActive)
              hasMarketMakerRole = isActive
            } catch (activeMemberError) {
              console.log('isActiveMember not available or failed:', activeMemberError.message)
            }
          }

          // Pre-check market creation limit (this is what the contract will call)
          if (hasMarketMakerRole) {
            try {
              const limitCheck = await roleManager.checkMarketCreationLimitFor.staticCall(userAddress, marketMakerRole)
              console.log('checkMarketCreationLimitFor result:', limitCheck)
              if (!limitCheck) {
                throw new Error('Market creation limit exceeded. You may need to wait or upgrade your tier.')
              }
            } catch (limitError) {
              console.warn('checkMarketCreationLimitFor check failed:', limitError.message)
              // Don't fail here - the contract might handle this differently
            }
          }
        } catch (roleError) {
          console.warn('Could not verify on-chain role:', roleError)
        }
      }

      // Always check blockchain for roles - roles could expire
      if (!isOwner && !hasMarketMakerRole) {
        if (roleManagerAddress === ethers.ZeroAddress) {
          throw new Error('Market creation requires contract owner privileges. Role manager not configured on factory.')
        }
        throw new Error('You do not have the MARKET_MAKER role on-chain. Your role may have expired. Please purchase or renew your Market Maker access.')
      }

      console.log('Pre-flight checks passed (on-chain verified):', { isOwner, hasMarketMakerRole, ctf1155Address })

      // Calculate trading period in seconds (enforce contract limits: 7-21 days)
      const tradingPeriodSeconds = Math.max(
        TradingPeriod.MIN,
        Math.min(TradingPeriod.MAX, submitData.tradingPeriod || TradingPeriod.DEFAULT)
      )

      // Parse initial liquidity using correct decimals for token
      const liquidityAmount = ethers.parseUnits(submitData.initialLiquidity.toString(), tokenDecimals)

      // Generate a unique proposal ID
      const proposalId = BigInt(Date.now())

      // Default liquidity parameter for LMSR
      // Use same decimals as collateral token for consistency
      const liquidityParameter = ethers.parseUnits('100', tokenDecimals)

      // Determine bet type from metadata or default to YesNo
      let betType = BetType.YesNo
      if (submitData.metadata?.attributes) {
        const betTypeAttr = submitData.metadata.attributes.find(
          attr => attr.trait_type === 'BetType'
        )
        if (betTypeAttr?.value && BetType[betTypeAttr.value] !== undefined) {
          betType = BetType[betTypeAttr.value]
        }
      }

      // Step 1: Check and approve collateral token if needed
      let currentStep = 1
      const currentAllowance = await collateralToken.allowance(userAddress, marketFactoryAddress)
      if (currentAllowance < liquidityAmount) {
        reportProgress(currentStep, totalSteps, 'Approving collateral token...', 'signing')
        const approveTx = await collateralToken.approve(marketFactoryAddress, liquidityAmount)
        reportProgress(currentStep, totalSteps, 'Waiting for approval confirmation...', 'confirming')
        await approveTx.wait()
        reportProgress(currentStep, totalSteps, 'Collateral approved', 'completed')
      } else {
        reportProgress(currentStep, totalSteps, 'Collateral already approved', 'completed')
      }

      // Step 2 (if hasMetadata): Upload metadata to IPFS
      let metadataUri = submitData.metadataUri || ''
      if (hasMetadata) {
        currentStep++
        reportProgress(currentStep, totalSteps, 'Uploading metadata to IPFS...', 'pending')
        try {
          console.log('Uploading market metadata to IPFS:', submitData.metadata)
          const uploadResult = await uploadMarketMetadata(submitData.metadata)
          metadataUri = uploadResult.uri
          console.log('Metadata uploaded to IPFS:', metadataUri)
          reportProgress(currentStep, totalSteps, 'Metadata uploaded to IPFS', 'completed')
        } catch (uploadError) {
          console.error('Failed to upload metadata to IPFS:', uploadError)
          throw new Error(`Failed to upload metadata: ${uploadError.message}`)
        }
      }

      // Step 3: Create the market on-chain
      currentStep++
      reportProgress(currentStep, totalSteps, 'Creating market...', 'signing')
      console.log('Deploying market pair with metadata...', {
        proposalId: proposalId.toString(),
        collateralToken: collateralTokenAddress,
        liquidityAmount: liquidityAmount.toString(),
        liquidityParameter: liquidityParameter.toString(),
        tradingPeriodSeconds,
        betType,
        metadataUri
      })

      // First try a static call to get detailed error information if it would fail
      try {
        await contract.deployMarketPairWithMetadata.staticCall(
          proposalId,
          collateralTokenAddress,
          liquidityAmount,
          liquidityParameter,
          tradingPeriodSeconds,
          betType,
          metadataUri
        )
        console.log('Static call simulation passed')
      } catch (staticCallError) {
        console.error('Static call simulation failed:', staticCallError)
        // Try to extract more detailed error info
        if (staticCallError.reason) {
          throw new Error(`Market creation would fail: ${staticCallError.reason}`)
        }
        if (staticCallError.data && staticCallError.data !== '0x') {
          // Try to decode error
          try {
            const decoded = contract.interface.parseError(staticCallError.data)
            if (decoded) {
              throw new Error(`Market creation would fail: ${decoded.name}(${decoded.args.join(', ')})`)
            }
          } catch {
            // Check for standard Error(string) revert
            if (staticCallError.data.startsWith('0x08c379a0')) {
              const abiCoder = new ethers.AbiCoder()
              const errorString = abiCoder.decode(['string'], '0x' + staticCallError.data.slice(10))[0]
              throw new Error(`Market creation would fail: ${errorString}`)
            }
          }
        }
        // If we can't get more info, throw with the original message
        throw new Error(`Market creation simulation failed: ${staticCallError.message}`)
      }

      const tx = await contract.deployMarketPairWithMetadata(
        proposalId,
        collateralTokenAddress,
        liquidityAmount,
        liquidityParameter,
        tradingPeriodSeconds,
        betType,
        metadataUri
      )

      console.log('Market creation transaction sent:', tx.hash)
      reportProgress(currentStep, totalSteps, 'Waiting for market confirmation...', 'confirming')
      const receipt = await tx.wait()
      console.log('Market created:', receipt)
      reportProgress(currentStep, totalSteps, 'Market created successfully', 'completed')

      // Extract market ID from event logs
      const marketCreatedEvent = receipt.logs.find(log => {
        try {
          const parsed = contract.interface.parseLog(log)
          return parsed?.name === 'MarketCreated'
        } catch {
          return false
        }
      })

      let marketId = null
      if (marketCreatedEvent) {
        const parsed = contract.interface.parseLog(marketCreatedEvent)
        marketId = parsed?.args?.marketId?.toString()
      }

      // Handle correlation group if provided
      if (hasCorrelation && marketId) {
        console.log('Processing correlation group:', submitData.correlationGroup)

        try {
          let groupId = submitData.correlationGroup.existingGroupId

          // Step 3 (optional): Create new group if needed
          if (isNewGroup) {
            currentStep++
            reportProgress(currentStep, totalSteps, 'Creating correlation group...', 'signing')
            console.log('Creating new correlation group...')
            const groupResult = await createCorrelationGroup(
              activeSigner,
              submitData.correlationGroup.newGroupName,
              submitData.correlationGroup.newGroupDescription || '',
              submitData.correlationGroup.category
            )
            groupId = groupResult.groupId
            console.log('New correlation group created:', groupId)
            reportProgress(currentStep, totalSteps, 'Correlation group created', 'completed')
          }

          // Step 3 or 4: Add market to group
          if (groupId !== null && groupId !== undefined) {
            currentStep++
            reportProgress(currentStep, totalSteps, 'Adding market to group...', 'signing')
            console.log('Adding market to correlation group:', { groupId, marketId })
            await addMarketToCorrelationGroup(activeSigner, groupId, parseInt(marketId))
            console.log('Market added to correlation group successfully')
            reportProgress(currentStep, totalSteps, 'Market added to group', 'completed')
          }
        } catch (correlationError) {
          // Log the error and notify user, but don't fail - market was already created
          console.error('Error handling correlation group:', correlationError)
          console.warn('Market was created but correlation group operation failed')
          reportProgress(currentStep, totalSteps, `Group operation failed: ${correlationError.message}`, 'failed')

          // Show user-friendly error message
          const errorMessage = correlationError.message || 'Unknown error'
          if (errorMessage.includes('group creator')) {
            console.warn('Permission error: Only the group creator or owner can add markets to this group')
          }
        }
      }

      setShowMarketCreationModal(false)

      return {
        id: marketId || `market-${Date.now()}`,
        txHash: receipt.hash
      }
    } catch (error) {
      console.error('Error creating market:', error)
      throw error
    }
  }

  const handleNavigateToAdmin = () => {
    setIsOpen(false)
    navigate('/admin/roles')
  }

  const shortenAddress = (addr) => {
    if (!addr) return ''
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`
  }

  const getConnectorName = (connector) => {
    // Format connector names nicely
    // Check connector name or type for better display
    const name = connector.name?.toLowerCase() || ''
    const type = connector.type?.toLowerCase() || ''
    
    if (name.includes('metamask') || type === 'metamask') return 'MetaMask'
    if (name.includes('walletconnect') || type === 'walletconnect') return 'WalletConnect'
    if (name.includes('coinbase')) return 'Coinbase Wallet'
    if (name === 'injected' || type === 'injected') {
      // Try to detect the actual wallet from window.ethereum
      if (typeof window !== 'undefined' && window.ethereum) {
        if (window.ethereum.isMetaMask) return 'MetaMask'
        if (window.ethereum.isCoinbaseWallet) return 'Coinbase Wallet'
        if (window.ethereum.isBraveWallet) return 'Brave Wallet'
        if (window.ethereum.isRabby) return 'Rabby'
      }
      return 'Browser Wallet'
    }
    return connector.name || 'Wallet'
  }

  return (
    <div className={`wallet-button-container ${className}`}>
      {!isConnected ? (
        <>
          <button
            ref={buttonRef}
            onClick={toggleDropdown}
            className="wallet-connect-button"
            aria-label="Connect Wallet"
            aria-expanded={isOpen}
            aria-haspopup="true"
          >
            <img 
              src={walletIcon} 
              alt="Wallet" 
              className="wallet-icon"
              width="24"
              height="24"
            />
            <span className="connect-text">Connect Wallet</span>
          </button>

          {isOpen && (
            <div 
              ref={dropdownRef}
              className="wallet-dropdown"
              role="menu"
            >
              <div className="dropdown-header">
                <h3>Connect a Wallet</h3>
              </div>
              <div className="connector-list">
                {isCheckingConnectors ? (
                  <div className="connector-loading">Detecting wallets...</div>
                ) : (
                  connectors.map((connector) => {
                    const available = isConnectorAvailable(connector)
                    const isThisConnecting = pendingConnector === connector.id && isConnecting
                    return (
                      <button
                        key={connector.id}
                        onClick={() => handleConnect(connector)}
                        className={`connector-option ${!available ? 'unavailable' : ''} ${isThisConnecting ? 'connecting' : ''}`}
                        role="menuitem"
                        disabled={isConnecting}
                      >
                        <span className="connector-name">
                          {getConnectorName(connector)}
                        </span>
                        {isThisConnecting && (
                          <span className="connector-status connecting">Connecting...</span>
                        )}
                        {!isThisConnecting && !available && connector.type === 'injected' && (
                          <span className="connector-status">Not Detected</span>
                        )}
                        {!isThisConnecting && connector.type === 'walletConnect' && (
                          <span className="connector-badge">QR Code</span>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
              <div className="dropdown-footer">
                <p className="help-text">
                  New to Web3 wallets?{' '}
                  <a 
                    href="https://ethereum.org/en/wallets/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    Learn more
                  </a>
                </p>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <button
            ref={buttonRef}
            onClick={toggleDropdown}
            className="wallet-account-button"
            aria-label="Wallet Account"
            aria-expanded={isOpen}
            aria-haspopup="true"
          >
            <BlockiesAvatar address={address} size={24} />
          </button>

          {isOpen && (
            <div 
              ref={dropdownRef}
              className="wallet-dropdown wallet-dropdown-extended"
              role="menu"
            >
              <div className="dropdown-header">
                <div className="account-info">
                  <BlockiesAvatar address={address} size={40} />
                  <div className="account-details">
                    <span className="account-address-full">{shortenAddress(address)}</span>
                    <span className="usc-balance">
                      {balanceLoading ? 'Loading...' : `${parseFloat(balances?.usc || 0).toFixed(2)} USC`}
                    </span>
                    <span className="network-info">Chain ID: {chainId}</span>
                  </div>
                </div>
              </div>

              {/* Roles Section - Enhanced with details */}
              <div className="dropdown-section">
                <RoleDetailsSection
                  roleDetails={roleDetails}
                  loading={roleDetailsLoading || rolesLoading}
                  onUpgrade={handleUpgradeRole}
                  onExtend={handleExtendRole}
                  onPurchase={() => handleOpenPurchaseModal()}
                  onRefresh={handleRefreshRoles}
                />
              </div>

              {/* Wagers Section - Unified */}
              <div className="dropdown-section">
                <span className="wallet-section-title">Wagers</span>
                {hasRole(ROLES.FRIEND_MARKET) ? (
                  <button
                    onClick={handleOpenFriendMarket}
                    className="action-button friend-market-btn"
                    role="menuitem"
                  >
                    <span aria-hidden="true">🎯</span>
                    <span>Create Wager</span>
                  </button>
                ) : (
                  <div className="friend-market-promo">
                    <p className="promo-text">Create private wagers with friends!</p>
                    <button
                      onClick={() => handleOpenPurchaseModal()}
                      className="action-button purchase-access-btn"
                      role="menuitem"
                    >
                      <span aria-hidden="true">🔓</span>
                      <span>Get Access - $50 USC per Month</span>
                    </button>
                  </div>
                )}
                {hasRole(ROLES.MARKET_MAKER) && (
                  <button
                    onClick={handleOpenMarketCreation}
                    className="action-button create-market-btn"
                    role="menuitem"
                  >
                    <span aria-hidden="true">📊</span>
                    <span>Create Prediction Market</span>
                  </button>
                )}
                <button
                  onClick={handleOpenMyMarkets}
                  className="action-button my-markets-btn"
                  role="menuitem"
                >
                  <span aria-hidden="true">📋</span>
                  <span>My Wagers</span>
                </button>
              </div>

              {/* Data Source Toggle */}
              <div className="dropdown-section">
                <div className="toggle-row">
                  <span className="toggle-label">
                    {preferences.demoMode ? '🎭 Demo Mode' : '🌐 Live Mode'}
                  </span>
                  <button
                    onClick={handleToggleDemoMode}
                    className="toggle-btn"
                    aria-label={`Switch to ${preferences.demoMode ? 'Live' : 'Demo'} Mode`}
                  >
                    {preferences.demoMode ? 'Go Live' : 'Use Demo'}
                  </button>
                </div>
              </div>

              {/* Theme Toggle */}
              <div className="dropdown-section">
                <div className="toggle-row">
                  <span className="toggle-label">
                    {isDark ? '🌙 Dark Theme' : '☀️ Light Theme'}
                  </span>
                  <button
                    onClick={toggleMode}
                    className="toggle-btn"
                    aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
                  >
                    {isDark ? 'Light Mode' : 'Dark Mode'}
                  </button>
                </div>
              </div>

              {/* Navigation Actions */}
              <div className="dropdown-actions">
                {hasRole(ROLES.ADMIN) && (
                  <button
                    onClick={handleNavigateToAdmin}
                    className="action-button"
                    role="menuitem"
                  >
                    <span aria-hidden="true">👑</span>
                    <span>Role Management</span>
                  </button>
                )}
                <a
                  href="https://v3.etcswap.org/#/swap"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="action-button get-usdc-btn"
                  role="menuitem"
                >
                  <span aria-hidden="true">💰</span>
                  <span>Get USC</span>
                </a>
                <button
                  onClick={handleDisconnect}
                  className="action-button disconnect-button"
                  role="menuitem"
                  aria-label="Disconnect wallet"
                >
                  <span aria-hidden="true">🔌</span>
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* My Wagers Modal */}
      <MyMarketsModal
        isOpen={showMyMarketsModal}
        onClose={() => setShowMyMarketsModal(false)}
        friendMarkets={friendMarkets}
      />

      {/* Create Wager Modal */}
      <FriendMarketsModal
        isOpen={showFriendMarketModal}
        onClose={() => setShowFriendMarketModal(false)}
        onCreate={handleFriendMarketCreation}
        activeMarkets={activeFriendMarkets}
        pastMarkets={pastFriendMarkets}
        pendingTransaction={loadPendingTransaction()}
        onClearPendingTransaction={clearPendingTransaction}
      />

      {/* Market Creation Modal - Prediction Markets */}
      <MarketCreationModal
        isOpen={showMarketCreationModal}
        onClose={() => setShowMarketCreationModal(false)}
        onCreate={handleMarketCreation}
      />
    </div>
  )
}

export default WalletButton
