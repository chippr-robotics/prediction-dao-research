import { useState, useEffect, useRef, useCallback } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { ethers } from 'ethers'
import { useETCswap } from '../../hooks/useETCswap'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useWalletRoles, useWeb3 } from '../../hooks'
import { useModal } from '../../hooks/useUI'
import { ROLES, ROLE_INFO } from '../../contexts/RoleContext'
import { getContractAddress } from '../../config/contracts'
import { MARKET_FACTORY_ABI } from '../../abis/ConditionalMarketFactory'
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
function WalletButton({ className = '', theme = 'dark' }) {
  const [isOpen, setIsOpen] = useState(false)
  const [showFriendMarketModal, setShowFriendMarketModal] = useState(false)
  const [showMarketCreationModal, setShowMarketCreationModal] = useState(false)
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const navigate = useNavigate()
  const { showModal } = useModal()
  const { balances, loading: balanceLoading } = useETCswap()
  const { preferences, setDemoMode } = useUserPreferences()
  const { roles, hasRole } = useWalletRoles()
  const { signer } = useWeb3()
  const dropdownRef = useRef(null)
  const buttonRef = useRef(null)
  const [connectorStatus, setConnectorStatus] = useState({})
  const [isCheckingConnectors, setIsCheckingConnectors] = useState(true)
  const [pendingConnector, setPendingConnector] = useState(null)

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

      const contract = new ethers.Contract(marketFactoryAddress, MARKET_FACTORY_ABI, activeSigner)

      // Calculate end time based on trading period (in days)
      const tradingPeriodDays = parseInt(data.data.tradingPeriod) || 7
      const endTime = Math.floor(Date.now() / 1000) + (tradingPeriodDays * 24 * 60 * 60)

      // Parse stake amount as initial liquidity
      const stakeAmount = data.data.stakeAmount || '10'
      const initialLiquidity = ethers.parseEther(stakeAmount)

      // Build description with friend market metadata
      let description = data.data.description
      if (data.marketType === 'oneVsOne') {
        description += `\n\n[Friend Market: 1v1 with ${data.data.opponent}]`
      } else if (data.marketType === 'smallGroup') {
        description += `\n\n[Friend Market: Group with ${data.data.members}]`
      }
      if (data.data.arbitrator) {
        description += `\n[Arbitrator: ${data.data.arbitrator}]`
      }

      // Create the market on-chain
      const tx = await contract.createMarket(
        data.data.description, // question
        description, // description with metadata
        'Friend Market', // category
        endTime,
        initialLiquidity,
        { value: initialLiquidity }
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
   * Supports prediction markets with web3 transactions
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

      const contract = new ethers.Contract(marketFactoryAddress, MARKET_FACTORY_ABI, activeSigner)

      // Calculate end time from trading period (tradingPeriod is already in seconds)
      const endTime = Math.floor(Date.now() / 1000) + submitData.tradingPeriod

      // Parse initial liquidity as wei
      const initialLiquidity = ethers.parseEther(submitData.initialLiquidity.toString())

      // Extract question and description from metadata
      let question = 'Prediction Market'
      let description = ''
      let category = 'Other'

      if (submitData.metadata) {
        question = submitData.metadata.name || question
        description = submitData.metadata.description || ''
        // Extract category from attributes
        const categoryAttr = submitData.metadata.attributes?.find(
          attr => attr.trait_type === 'Category'
        )
        category = categoryAttr?.value || category
      } else if (submitData.metadataUri) {
        // If using custom URI, use minimal info
        question = `Market (${submitData.metadataUri.slice(0, 20)}...)`
        description = `Metadata: ${submitData.metadataUri}`
      }

      // Create the market on-chain
      const tx = await contract.createMarket(
        question,
        description,
        category,
        endTime,
        initialLiquidity,
        { value: initialLiquidity }
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
            <span className="account-address">{shortenAddress(address)}</span>
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
                <span className="wallet-section-title">Your Roles</span>
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
                    <span>Create Friend Market</span>
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
                      <span>Get Access - 50 USC</span>
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
