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
import BlockiesAvatar from '../ui/BlockiesAvatar'
import PremiumPurchaseModal from '../ui/PremiumPurchaseModal'
import MarketCreationModal from '../fairwins/MarketCreationModal'
import walletIcon from '../../assets/wallet_no_text.svg'
import { FriendMarketsModal } from '../fairwins'
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

      // Get collateral token address (USC/FairWins token)
      const collateralTokenAddress = getContractAddress('fairWinsToken')
      if (!collateralTokenAddress) {
        throw new Error('Collateral token not configured')
      }

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

      // Parse stake amount as liquidity (in token units)
      const stakeAmount = data.data.stakeAmount || '10'
      const liquidityAmount = ethers.parseEther(stakeAmount)

      // Generate a unique proposal ID for the friend market
      const proposalId = BigInt(Date.now())

      // Default liquidity parameter for LMSR (higher = more liquidity depth)
      const liquidityParameter = ethers.parseEther('100')

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
   */
  const handleMarketCreation = async (submitData, modalSigner) => {
    const activeSigner = modalSigner || signer

    if (!activeSigner) {
      console.error('No signer available for market creation')
      throw new Error('Please connect your wallet to create a market')
    }

    console.log('Market creation data:', submitData)

    try {
      const marketFactoryAddress = getContractAddress('marketFactory')
      if (!marketFactoryAddress) {
        throw new Error('Market factory contract not deployed on this network')
      }

      // Get collateral token address (USC/FairWins token)
      const collateralTokenAddress = getContractAddress('fairWinsToken')
      if (!collateralTokenAddress) {
        throw new Error('Collateral token not configured')
      }

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
          'function isActiveMember(address user, bytes32 role) view returns (bool)'
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

      // Parse initial liquidity as token amount
      const liquidityAmount = ethers.parseEther(submitData.initialLiquidity.toString())

      // Generate a unique proposal ID
      const proposalId = BigInt(Date.now())

      // Default liquidity parameter for LMSR
      const liquidityParameter = ethers.parseEther('100')

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

      // Check and approve collateral token if needed (userAddress already retrieved during pre-flight)
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

      console.log('Market creation transaction sent:', tx.hash)
      const receipt = await tx.wait()
      console.log('Market created:', receipt)

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
