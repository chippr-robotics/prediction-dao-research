import { useState, useEffect, useRef, useCallback } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { useDex } from '../../hooks/useDex'
import { useNetworkMode } from '../../hooks/useNetworkMode'
import { useWalletRoles } from '../../hooks'
import { useRoleDetails } from '../../hooks/useRoleDetails'
import { useModal } from '../../hooks/useUI'
import { ROLES, ROLE_INFO } from '../../contexts/RoleContext'
import { DEX_ADDRESSES, TOKENS } from '../../constants/dex'
import { WAGER_DEFAULTS } from '../../constants/wagerDefaults'
import BlockiesAvatar from '../ui/BlockiesAvatar'
import PremiumPurchaseModal from '../ui/PremiumPurchaseModal'
import { RoleDetailsSection } from './RoleDetailsCard'
import walletIcon from '../../assets/wallet_no_text.svg'
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

// Pending-tx tracking lives in useFriendMarketCreation now.

function WalletButton({ className = '' }) {
  const [isOpen, setIsOpen] = useState(false)
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const navigate = useNavigate()
  const { showModal } = useModal()
  const { balances, loading: balanceLoading } = useDex()
  const { isTestnet, network } = useNetworkMode()
  const { hasRole, rolesLoading, refreshRoles } = useWalletRoles()
  const {
    roleDetails,
    loading: roleDetailsLoading,
    refresh: refreshRoleDetails
  } = useRoleDetails()
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

  const handleNavigateToAdmin = () => {
    setIsOpen(false)
    navigate('/admin')
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
                    <span className="usdc-balance">
                      {balanceLoading ? 'Loading...' : `${parseFloat(balances?.stable || 0).toFixed(2)} USDC`}
                    </span>
                    <span className="network-info">{network?.name || `Chain ${chainId}`}</span>
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

              {/* Wager creation & management now live on the Dashboard, so the
                  dropdown no longer carries "Create Wager" / "My Wagers". The
                  membership upsell stays for non-members. */}
              {!hasRole(ROLES.WAGER_PARTICIPANT) && (
                <div className="dropdown-section">
                  <span className="wallet-section-title">Wagers</span>
                  <div className="friend-market-promo">
                    <p className="promo-text">Create private wagers with friends!</p>
                    <button
                      onClick={() => handleOpenPurchaseModal()}
                      className="action-button purchase-access-btn"
                      role="menuitem"
                    >
                      <span aria-hidden="true">🔓</span>
                      <span>Get Access - from $2 USDC / month</span>
                    </button>
                  </div>
                </div>
              )}

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
                  href={isTestnet ? "https://faucet.circle.com/" : "https://app.uniswap.org/swap?chain=polygon"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="action-button get-usdc-btn"
                  role="menuitem"
                >
                  <span aria-hidden="true">💰</span>
                  <span>Get USDC</span>
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

    </div>
  )
}

export default WalletButton
