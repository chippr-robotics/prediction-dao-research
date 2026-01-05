import { useState, useEffect, useRef, useCallback } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { useModal } from '../../hooks/useUI'
import BlockiesAvatar from '../ui/BlockiesAvatar'
import UserManagementModal from '../ui/UserManagementModal'
import walletIcon from '../../assets/wallet_no_text.svg'
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
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { showModal } = useModal()
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

  const handleOpenUserManagement = () => {
    setIsOpen(false)
    showModal(<UserManagementModal />, {
      title: 'User Management',
      size: 'large',
      closable: true
    })
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
              className="wallet-dropdown"
              role="menu"
            >
              <div className="dropdown-header">
                <div className="account-info">
                  <BlockiesAvatar address={address} size={40} />
                  <div className="account-details">
                    <span className="account-address-full">{shortenAddress(address)}</span>
                    <span className="network-info">Chain ID: {chainId}</span>
                  </div>
                </div>
              </div>
              <div className="dropdown-actions">
                <button
                  onClick={handleOpenUserManagement}
                  className="action-button"
                  role="menuitem"
                  aria-label="Manage settings and preferences"
                >
                  <span aria-hidden="true">⚙️</span>
                  <span>Manage Settings</span>
                </button>
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
