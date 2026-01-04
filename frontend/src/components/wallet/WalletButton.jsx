import { useState, useEffect, useRef } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { useModal } from '../../hooks/useUI'
import BlockiesAvatar from '../ui/BlockiesAvatar'
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
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { showModal } = useModal()
  const dropdownRef = useRef(null)
  const buttonRef = useRef(null)

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

  const handleConnect = async (connector) => {
    try {
      await connect({ connector })
      setIsOpen(false)
    } catch (error) {
      console.error('Error connecting wallet:', error)
    }
  }

  const handleDisconnect = () => {
    disconnect()
    setIsOpen(false)
  }

  const handleOpenUserManagement = () => {
    setIsOpen(false)
    // Open user management modal through the modal system
    import('../ui/UserManagementModal').then((module) => {
      const UserManagementModal = module.default
      showModal(<UserManagementModal />, {
        title: 'User Management',
        size: 'large',
        closable: true
      })
    })
  }

  const shortenAddress = (addr) => {
    if (!addr) return ''
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`
  }

  const getConnectorName = (connector) => {
    // Format connector names nicely
    if (connector.name === 'MetaMask') return 'MetaMask'
    if (connector.name === 'WalletConnect') return 'WalletConnect'
    if (connector.name === 'Injected') return 'Browser Wallet'
    return connector.name
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
                {connectors.map((connector) => (
                  <button
                    key={connector.id}
                    onClick={() => handleConnect(connector)}
                    className="connector-option"
                    role="menuitem"
                    disabled={!connector.ready}
                  >
                    <span className="connector-name">
                      {getConnectorName(connector)}
                    </span>
                    {!connector.ready && (
                      <span className="connector-status">Not Installed</span>
                    )}
                  </button>
                ))}
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
                >
                  <span>⚙️</span>
                  <span>Manage Settings</span>
                </button>
                <button
                  onClick={handleDisconnect}
                  className="action-button disconnect-button"
                  role="menuitem"
                >
                  <span>🔌</span>
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
