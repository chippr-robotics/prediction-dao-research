import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { ethers } from 'ethers'
import { useETCswap } from '../../hooks/useETCswap'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useWalletRoles, useWeb3 } from '../../hooks'
import { useTheme } from '../../hooks/useTheme'
import { useModal } from '../../hooks/useUI'
import { ROLES, ROLE_INFO } from '../../contexts/RoleContext'
import { getContractAddress } from '../../config/contracts'
import { MARKET_FACTORY_ABI, BetType, TradingPeriod, ERC20_ABI } from '../../abis/ConditionalMarketFactory'
import { ETCSWAP_ADDRESSES, TOKENS } from '../../constants/etcswap'
import {
  isCorrelationRegistryDeployed,
  createCorrelationGroup,
  addMarketToCorrelationGroup
} from '../../utils/blockchainService'
import { uploadMarketMetadata } from '../../utils/ipfsService'
import BlockiesAvatar from '../ui/BlockiesAvatar'
import PremiumPurchaseModal from '../ui/PremiumPurchaseModal'
import MarketCreationModal from '../fairwins/MarketCreationModal'
import walletIcon from '../../assets/wallet_no_text.svg'
import { FriendMarketsModal, MyMarketsModal } from '../fairwins'
import './WalletButton.css'

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

function WalletButton({ className = '', theme = 'dark' }) {
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
  const { roles, hasRole, rolesLoading, refreshRoles } = useWalletRoles()
  const { signer } = useWeb3()
  const { mode, toggleMode, isDark } = useTheme()
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

    const active = userMarkets.filter(m => {
      const endDate = new Date(m.endDate)
      return endDate > now && m.status !== 'resolved'
    })

    const past = userMarkets.filter(m => {
      const endDate = new Date(m.endDate)
      return endDate <= now || m.status === 'resolved'
    })

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
  
  // Close dropdown only when connection state changes from disconnected to connected
  // while we have a pending connection attempt
  useEffect(() => {
    // Only close if we were disconnected and now we're connected
    // AND we initiated a connection (pendingConnector is set)
    if (!wasConnected.current && isConnected && pendingConnector) {
      setIsOpen(false)
      setPendingConnector(null)
    }
    // Update the ref for next comparison
    wasConnected.current = isConnected
  }, [isConnected, pendingConnector])

  // Reset pending connector when connection attempt finishes (success or failure)
  useEffect(() => {
    if (!isConnecting && pendingConnector) {
      // Small delay to allow isConnected to update first
      const timeout = setTimeout(() => {
        setPendingConnector(null)
      }, 100)
      return () => clearTimeout(timeout)
    }
  }, [isConnecting, pendingConnector])

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

  const handleOpenPurchaseModal = () => {
    setIsOpen(false)
    showModal(<PremiumPurchaseModal onClose={() => showModal(null)} />, {
      title: '',
      size: 'large',
      closable: false
    })
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

    try {
      const marketFactoryAddress = getContractAddress('marketFactory')
      if (!marketFactoryAddress) {
        throw new Error('Market factory contract not deployed on this network')
      }

      // Get collateral token address - use form data or default to USC stablecoin
      const collateralTokenAddress = data.data?.collateralToken || ETCSWAP_ADDRESSES.USC_STABLECOIN
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

      // Check if user can create markets (Friend Market uses same role as Market Maker)
      const isOwner = userAddress.toLowerCase() === ownerAddress.toLowerCase()
      let hasMarketMakerRole = false

      // Log role check details for debugging
      console.log('Friend Market role check details:', {
        userAddress,
        ownerAddress,
        isOwner,
        roleManagerFromFactory: roleManagerAddress,
        expectedRoleManager: getContractAddress('roleManager')
      })

      if (roleManagerAddress !== ethers.ZeroAddress) {
        const roleManagerAbi = [
          'function hasRole(bytes32 role, address account) view returns (bool)',
          'function MARKET_MAKER_ROLE() view returns (bytes32)',
          'function isActiveMember(address user, bytes32 role) view returns (bool)'
        ]
        const roleManager = new ethers.Contract(roleManagerAddress, roleManagerAbi, activeSigner)
        try {
          const marketMakerRole = await roleManager.MARKET_MAKER_ROLE()
          console.log('MARKET_MAKER_ROLE hash:', marketMakerRole)

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
        } catch (roleError) {
          console.warn('Could not verify on-chain role:', roleError)
        }
      }

      // Always check blockchain for roles - roles could expire
      if (!isOwner && !hasMarketMakerRole) {
        if (roleManagerAddress === ethers.ZeroAddress) {
          throw new Error('Friend market creation requires contract owner privileges. Role manager not configured on factory.')
        }
        throw new Error('You do not have the MARKET_MAKER role on-chain. Your role may have expired. Please purchase or renew your Market Maker access.')
      }

      console.log('Pre-flight checks passed (on-chain verified):', { isOwner, hasMarketMakerRole, ctf1155Address })

      // Calculate trading period in seconds (contract requires 7-21 days)
      const tradingPeriodDays = parseInt(data.data.tradingPeriod) || 7
      const tradingPeriodSeconds = Math.max(
        TradingPeriod.MIN,
        Math.min(TradingPeriod.MAX, tradingPeriodDays * 24 * 60 * 60)
      )

      // Parse stake amount as liquidity using correct decimals for token
      const stakeAmount = data.data.stakeAmount || '10'
      const liquidityAmount = ethers.parseUnits(stakeAmount, tokenDecimals)

      // Generate a unique proposal ID for the friend market
      const proposalId = BigInt(Date.now())

      // Default liquidity parameter for LMSR (higher = more liquidity depth)
      // Use same decimals as collateral token for consistency
      const liquidityParameter = ethers.parseUnits('100', tokenDecimals)

      // Use WinLose bet type for friend markets (1v1 style)
      const betType = BetType.WinLose

      // Check and approve collateral token if needed
      const currentAllowance = await collateralToken.allowance(userAddress, marketFactoryAddress)
      if (currentAllowance < liquidityAmount) {
        console.log('Approving collateral token...')
        const approveTx = await collateralToken.approve(marketFactoryAddress, liquidityAmount)
        await approveTx.wait()
        console.log('Collateral approved')
      }

      // Create the market on-chain using deployMarketPair
      console.log('Deploying market pair...', {
        proposalId: proposalId.toString(),
        collateralToken: collateralTokenAddress,
        liquidityAmount: liquidityAmount.toString(),
        liquidityParameter: liquidityParameter.toString(),
        tradingPeriodSeconds,
        betType
      })

      const tx = await contract.deployMarketPair(
        proposalId,
        collateralTokenAddress,
        liquidityAmount,
        liquidityParameter,
        tradingPeriodSeconds,
        betType
      )

      console.log('Friend market transaction sent:', tx.hash)
      const receipt = await tx.wait()
      console.log('Friend market created:', receipt)

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

      // Store the friend market for display in Activity tab
      const endDate = new Date(Date.now() + tradingPeriodDays * 24 * 60 * 60 * 1000)

      const newMarket = {
        id: marketId || `friend-${Date.now()}`,
        type: data.marketType || 'oneVsOne',
        description: data.data.description || 'Friend Market',
        stakeAmount: data.data.stakeAmount || '10',
        tradingPeriod: tradingPeriodDays.toString(),
        participants: data.data.participants || [userAddress],
        creator: userAddress,
        createdAt: new Date().toISOString(),
        endDate: endDate.toISOString(),
        status: 'active',
        txHash: receipt.hash,
        proposalId: proposalId.toString()
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
        id: marketId || `friend-${Date.now()}`,
        txHash: receipt.hash
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
          } catch (decodeErr) {
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

              {/* Roles Section */}
              <div className="dropdown-section">
                <div className="roles-header">
                  <span className="wallet-section-title">Your Roles</span>
                  <button
                    onClick={refreshRoles}
                    className="roles-refresh-btn"
                    disabled={rolesLoading}
                    aria-label="Refresh roles from blockchain"
                    title="Refresh roles from blockchain"
                  >
                    <span className={`refresh-icon ${rolesLoading ? 'spinning' : ''}`}>&#8635;</span>
                  </button>
                </div>
                {roles.length > 0 ? (
                  <div className="roles-list">
                    {roles.map(role => {
                      const roleInfo = ROLE_INFO[role]
                      return (
                        <div key={role} className="role-item">
                          <span className="role-badge">{roleInfo?.name || role}</span>
                          {roleInfo?.premium && <span className="premium-indicator">★</span>}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <button 
                    onClick={handleOpenPurchaseModal}
                    className="action-button get-roles-btn"
                    role="menuitem"
                  >
                    <span aria-hidden="true">🎫</span>
                    <span>Get Premium Access</span>
                  </button>
                )}
              </div>

              {/* My Markets Section */}
              <div className="dropdown-section">
                <span className="wallet-section-title">My Markets</span>
                <button
                  onClick={handleOpenMyMarkets}
                  className="action-button my-markets-btn"
                  role="menuitem"
                >
                  <span aria-hidden="true">&#128202;</span>
                  <span>View My Markets</span>
                </button>
              </div>

              {/* Friend Markets Section */}
              <div className="dropdown-section">
                <span className="wallet-section-title">Friend Markets</span>
                {hasRole(ROLES.FRIEND_MARKET) ? (
                  <button
                    onClick={handleOpenFriendMarket}
                    className="action-button friend-market-btn"
                    role="menuitem"
                  >
                    <span aria-hidden="true">🎯</span>
                    <span>My Friend Markets</span>
                  </button>
                ) : (
                  <div className="friend-market-promo">
                    <p className="promo-text">Create private prediction markets with friends!</p>
                    <button
                      onClick={handleOpenPurchaseModal}
                      className="action-button purchase-access-btn"
                      role="menuitem"
                    >
                      <span aria-hidden="true">🔓</span>
                      <span>Get Access - $50 USC per Month</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Create Market Section */}
              <div className="dropdown-section">
                <span className="wallet-section-title">Prediction Markets</span>
                {hasRole(ROLES.MARKET_MAKER) ? (
                  <button
                    onClick={handleOpenMarketCreation}
                    className="action-button create-market-btn"
                    role="menuitem"
                  >
                    <span aria-hidden="true">📊</span>
                    <span>Create New Market</span>
                  </button>
                ) : (
                  <div className="create-market-promo">
                    <p className="promo-text">Create prediction markets with liquidity pools!</p>
                    <button
                      onClick={handleOpenPurchaseModal}
                      className="action-button purchase-access-btn"
                      role="menuitem"
                    >
                      <span aria-hidden="true">🔓</span>
                      <span>Get Market Maker Access</span>
                    </button>
                  </div>
                )}
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

      {/* My Markets Modal */}
      <MyMarketsModal
        isOpen={showMyMarketsModal}
        onClose={() => setShowMyMarketsModal(false)}
        friendMarkets={friendMarkets}
      />

      {/* Friend Market Creation Modal */}
      <FriendMarketsModal
        isOpen={showFriendMarketModal}
        onClose={() => setShowFriendMarketModal(false)}
        onCreate={handleFriendMarketCreation}
        activeMarkets={activeFriendMarkets}
        pastMarkets={pastFriendMarkets}
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
