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
import { FRIEND_GROUP_MARKET_FACTORY_ABI } from '../../abis/FriendGroupMarketFactory'
import { ETCSWAP_ADDRESSES, TOKENS } from '../../constants/etcswap'

// Minimal ERC20 ABI for stake token interactions
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)'
]
import { WAGER_DEFAULTS } from '../../constants/wagerDefaults'
import {
  getUserTierOnChain,
  hasRoleOnChain,
  checkRoleSyncNeeded,
} from '../../utils/blockchainService'
import { useFriendMarkets } from '../../contexts/FriendMarketsContext.js'
import {
  uploadEncryptedEnvelope,
  buildEncryptedIpfsReference
} from '../../utils/ipfsService'
import BlockiesAvatar from '../ui/BlockiesAvatar'
import PremiumPurchaseModal from '../ui/PremiumPurchaseModal'
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
  const [showMyMarketsModal, setShowMyMarketsModal] = useState(false)
  const { friendMarkets, addMarket: addFriendMarket } = useFriendMarkets()
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
            `Please wait for the role to be synced automatically. ` +
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
      const stakeAmountRaw = data.data.stakeAmount || WAGER_DEFAULTS.STAKE_AMOUNT
      const stakeWei = ethers.parseUnits(stakeAmountRaw, tokenDecimals)

      // Get odds multiplier (only used for bookmaker markets)
      // 200 = 2x equal stakes, 10000 = 100x
      const oddsMultiplier = parseInt(data.data.oddsMultiplier) || WAGER_DEFAULTS.ODDS_MULTIPLIER

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
          oddsMultiplier: isBookmaker ? oddsMultiplier : WAGER_DEFAULTS.ODDS_MULTIPLIER,
          resolutionType: resolutionType
        }
      })
      const receipt = await tx.wait()
      console.log('Friend market created:', receipt)

      // Validate transaction was successful
      if (receipt && receipt.status === 0) {
        clearPendingTransaction()
        throw new Error('Transaction reverted on-chain. The wager was not created. Check your parameters and try again.')
      }
      if (!receipt) {
        clearPendingTransaction()
        throw new Error('Transaction was dropped or replaced. Please try again.')
      }

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
        oddsMultiplier: isBookmaker ? oddsMultiplier : WAGER_DEFAULTS.ODDS_MULTIPLIER, // 200 = equal stakes for non-bookmaker
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

      // Add to shared context (persists to localStorage automatically)
      addFriendMarket(newMarket)

      console.log('Friend market stored:', newMarket)

      setShowFriendMarketModal(false)

      return {
        id: friendMarketId || `friend-${Date.now()}`,
        txHash: receipt.hash,
        status: 'pending'
      }
    } catch (error) {
      console.error('Error creating friend market:', error)
      if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
        throw new Error('Transaction was rejected in your wallet.')
      }
      if (error.code === 'INSUFFICIENT_FUNDS') {
        throw new Error('Insufficient funds to cover the stake and gas fees.')
      }
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
                <button
                  onClick={() => { setIsOpen(false); navigate('/wallet') }}
                  className="action-button"
                  role="menuitem"
                >
                  <span aria-hidden="true">{'\u2699\uFE0F'}</span>
                  <span>My Account</span>
                </button>
                {hasRole(ROLES.ADMIN) && (
                  <button
                    onClick={handleNavigateToAdmin}
                    className="action-button"
                    role="menuitem"
                  >
                    <span aria-hidden="true">{'\uD83D\uDC51'}</span>
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

    </div>
  )
}

export default WalletButton
