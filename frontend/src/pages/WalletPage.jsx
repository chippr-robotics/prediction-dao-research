import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet, useWalletConnection, useWalletRoles } from '../hooks'
import { useEncryption } from '../hooks/useEncryption'
import { useModal } from '../hooks/useUI'
import { ROLES, ROLE_INFO } from '../contexts/RoleContext'
import { hasRegisteredKey, registerEncryptionKey } from '../utils/keyRegistryService'
import SwapPanel from '../components/fairwins/SwapPanel'
import PremiumPurchaseModal from '../components/ui/PremiumPurchaseModal'
import BlockiesAvatar from '../components/ui/BlockiesAvatar'
import LoadingScreen from '../components/ui/LoadingScreen'
import './WalletPage.css'

const CONNECTOR_CONFIG = {
  walletConnect: {
    icon: '\uD83D\uDD17',
    label: 'WalletConnect'
  },
  injected: {
    icon: '\uD83E\uDD8A',
    label: 'MetaMask'
  }
}

const getConnectorInfo = (connector) => {
  const config = CONNECTOR_CONFIG[connector.id]
  if (config) {
    return `${config.icon} ${config.label}`
  }
  return connector.name || connector.id
}

function WalletPage() {
  const { address, isConnected, connectors } = useWallet()
  const { connectWallet, disconnectWallet } = useWalletConnection()
  const { showModal, hideModal } = useModal()
  const { roles, hasRole } = useWalletRoles()
  const { isInitialized, isInitializing, ensureInitialized } = useEncryption()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('account')
  const [connectingConnectorId, setConnectingConnectorId] = useState(null)
  const [connectionError, setConnectionError] = useState(null)
  const [keyRegistered, setKeyRegistered] = useState(null)
  const [keyCheckLoading, setKeyCheckLoading] = useState(false)
  const [keyRegisterLoading, setKeyRegisterLoading] = useState(false)
  const [keyError, setKeyError] = useState(null)

  const handleConnect = async (connectorId) => {
    setConnectingConnectorId(connectorId)
    setConnectionError(null)

    try {
      const success = await connectWallet(connectorId)
      if (!success) {
        setConnectionError('Failed to connect wallet. Please try again.')
      }
    } catch (error) {
      console.error('Wallet connection error:', error)

      if (error.message.includes('rejected') || error.message.includes('approve')) {
        setConnectionError('Connection request was rejected. Please try again.')
      } else if (error.message.includes('connector')) {
        setConnectionError('No wallet connector available. Please install a Web3 wallet.')
      } else {
        setConnectionError(error.message || 'Failed to connect wallet. Please try again.')
      }
    } finally {
      setConnectingConnectorId(null)
    }
  }

  const handleDisconnect = () => {
    disconnectWallet()
    navigate('/app')
  }

  const handleOpenPurchaseModal = () => {
    showModal(<PremiumPurchaseModal onClose={hideModal} />, {
      title: '',
      size: 'large',
      closable: false
    })
  }

  const handleNavigateToAdmin = () => {
    navigate('/admin/roles')
  }

  const handleClose = () => {
    navigate(-1)
  }

  const handleCheckKeyStatus = useCallback(async () => {
    if (!address) return
    setKeyCheckLoading(true)
    setKeyError(null)
    try {
      const { ethers } = await import('ethers')
      const provider = new ethers.BrowserProvider(window.ethereum)
      const registered = await hasRegisteredKey(address, provider)
      setKeyRegistered(registered)
    } catch (err) {
      setKeyError('Could not check key status: ' + err.message)
    } finally {
      setKeyCheckLoading(false)
    }
  }, [address])

  const handleRegisterKey = useCallback(async () => {
    setKeyRegisterLoading(true)
    setKeyError(null)
    try {
      const result = await ensureInitialized()
      if (!result?.publicKey) {
        throw new Error('Failed to derive encryption keys')
      }
      const { ethers } = await import('ethers')
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      await registerEncryptionKey(signer, result.publicKey)
      setKeyRegistered(true)
    } catch (err) {
      if (err.message.includes('rejected') || err.message.includes('denied')) {
        setKeyError('Transaction was rejected.')
      } else {
        setKeyError('Key registration failed: ' + err.message)
      }
    } finally {
      setKeyRegisterLoading(false)
    }
  }, [ensureInitialized])

  const shortenAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  return (
    <div className="wallet-page-backdrop">
      <div className="wallet-page-container">
        <div className="wallet-page">
          <button
            className="page-close-btn"
            onClick={handleClose}
            aria-label="Close"
          >
            &times;
          </button>

          {isConnected && (
            <div className="page-header-section">
              <div className="wallet-info-header">
                <BlockiesAvatar address={address} size={40} className="wallet-avatar" />
                <span className="wallet-address-display">{shortenAddress(address)}</span>
                <span className="status-dot connected" aria-hidden="true"></span>
              </div>
            </div>
          )}

          {!isConnected ? (
            <div className="connect-section">
              <div className="connect-prompt">
                <div className="connect-icon" aria-hidden="true">{'\uD83D\uDD17'}</div>
                <h3>Connect Your Wallet</h3>
                <p>Connect your Web3 wallet to access all features, manage your membership, and create wagers.</p>

                {connectionError && (
                  <div className="connection-error" role="alert" aria-live="assertive">
                    <span className="error-icon" aria-hidden="true">{'\u26A0\uFE0F'}</span>
                    <span className="error-message">{connectionError}</span>
                  </div>
                )}

                <div className="connector-options">
                  {connectors.map((connector) => {
                    const isThisConnecting = connectingConnectorId === connector.id
                    return (
                      <button
                        key={connector.id}
                        onClick={() => handleConnect(connector.id)}
                        className="connector-btn"
                        disabled={connectingConnectorId !== null}
                        aria-busy={isThisConnecting}
                      >
                        {isThisConnecting ? (
                          <>
                            <LoadingScreen visible={true} inline size="small" text="" />
                            <span style={{ marginLeft: '8px' }}>Connecting...</span>
                          </>
                        ) : (
                          getConnectorInfo(connector)
                        )}
                      </button>
                    )
                  })}
                </div>

                <div className="wallet-help" role="note">
                  <p>New to Web3 wallets?</p>
                  <a
                    href="https://ethereum.org/en/wallets/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="install-metamask-link"
                  >
                    Learn about Web3 wallets
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={activeTab === 'account'} className={`tab ${activeTab === 'account' ? 'active' : ''}`} onClick={() => setActiveTab('account')}>Account</button>
                <button role="tab" aria-selected={activeTab === 'membership'} className={`tab ${activeTab === 'membership' ? 'active' : ''}`} onClick={() => setActiveTab('membership')}>Membership</button>
                <button role="tab" aria-selected={activeTab === 'security'} className={`tab ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>Security</button>
                <button role="tab" aria-selected={activeTab === 'swap'} className={`tab ${activeTab === 'swap' ? 'active' : ''}`} onClick={() => setActiveTab('swap')}>Swap</button>
              </div>

              <div className="tab-content">
                {activeTab === 'account' && (
                  <div className="profile-section" role="tabpanel">
                    <div className="section">
                      <h3>Wallet</h3>
                      <div className="wallet-details">
                        <div className="detail-row">
                          <span className="label">Address:</span>
                          <span className="value">{address}</span>
                        </div>
                        <button onClick={handleDisconnect} className="disconnect-btn">Disconnect Wallet</button>
                      </div>
                    </div>

                    {hasRole(ROLES.ADMIN) && (
                      <div className="section admin-section">
                        <h3>Administration</h3>
                        <p className="section-description">Manage roles and permissions for users</p>
                        <button onClick={handleNavigateToAdmin} className="admin-panel-btn">Role Management</button>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'membership' && (
                  <div className="membership-section" role="tabpanel">
                    <div className="section">
                      <h3>Your Roles</h3>
                      {roles.length > 0 ? (
                        <div className="user-roles-list">
                          {roles.map(role => {
                            const roleInfo = ROLE_INFO[role]
                            return (
                              <div key={role} className="user-role-item">
                                <div className="role-header">
                                  <span className="role-badge">{roleInfo?.name || role}</span>
                                  {roleInfo?.premium && <span className="premium-badge">Premium</span>}
                                </div>
                                <p className="role-desc">{roleInfo?.description || 'No description'}</p>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="no-roles-message">
                          <p>You don't have any roles yet. Get a membership to create and accept wagers.</p>
                        </div>
                      )}
                    </div>

                    <div className="section">
                      <h3>Membership</h3>
                      {hasRole(ROLES.FRIEND_MARKET) ? (
                        <div className="membership-active">
                          <div className="membership-status-badge active">Active</div>
                          <p>You have access to create and accept P2P wagers.</p>
                          <button onClick={handleOpenPurchaseModal} className="renew-btn">Renew / Upgrade</button>
                        </div>
                      ) : (
                        <div className="membership-inactive">
                          <p>Get access to create and accept encrypted P2P wagers with friends.</p>
                          <button onClick={handleOpenPurchaseModal} className="get-roles-btn">Get Membership</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'security' && (
                  <div className="security-section" role="tabpanel">
                    <div className="section">
                      <h3>Encryption Key</h3>
                      <p className="section-description">
                        Your encryption key allows you to send and receive encrypted wagers. It is derived from your wallet signature and registered on-chain.
                      </p>

                      <div className="key-status-card">
                        <div className="key-status-row">
                          <span className="key-status-label">Local Keys:</span>
                          <span className={`key-status-value ${isInitialized ? 'active' : 'inactive'}`}>
                            {isInitializing ? 'Initializing...' : isInitialized ? 'Derived' : 'Not initialized'}
                          </span>
                        </div>
                        <div className="key-status-row">
                          <span className="key-status-label">On-chain Registration:</span>
                          <span className={`key-status-value ${keyRegistered ? 'active' : keyRegistered === false ? 'inactive' : ''}`}>
                            {keyCheckLoading ? 'Checking...' : keyRegistered === null ? 'Not checked' : keyRegistered ? 'Registered' : 'Not registered'}
                          </span>
                        </div>
                      </div>

                      {keyError && (
                        <div className="key-error" role="alert">
                          {keyError}
                        </div>
                      )}

                      <div className="key-actions">
                        <button
                          onClick={handleCheckKeyStatus}
                          className="key-action-btn secondary"
                          disabled={keyCheckLoading}
                        >
                          {keyCheckLoading ? 'Checking...' : 'Check Status'}
                        </button>

                        {!keyRegistered && (
                          <button
                            onClick={handleRegisterKey}
                            className="key-action-btn primary"
                            disabled={keyRegisterLoading}
                          >
                            {keyRegisterLoading ? 'Registering...' : 'Register Encryption Key'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'swap' && (
                  <div className="swap-section" role="tabpanel">
                    <SwapPanel />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default WalletPage
