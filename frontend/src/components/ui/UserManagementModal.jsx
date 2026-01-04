import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet, useWalletConnection, useWalletRoles } from '../../hooks'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useModal } from '../../hooks/useUI'
import { ROLES, ROLE_INFO } from '../../contexts/RoleContext'
import SwapPanel from '../fairwins/SwapPanel'
import RolePurchaseModal from './RolePurchaseModal'
import BlockiesAvatar from './BlockiesAvatar'
import WalletButton from '../wallet/WalletButton'
import './UserManagementModal.css'

// eslint-disable-next-line no-unused-vars
function UserManagementModal({ onScanMarket }) {
  const { address, isConnected } = useWallet()
  const { disconnectWallet } = useWalletConnection()
  const { hideModal, showModal } = useModal()
  const { preferences, setClearPathStatus, setDemoMode } = useUserPreferences()
  const { roles, hasRole } = useWalletRoles()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('profile')
  const [searchQuery, setSearchQuery] = useState('')
  const wasDisconnectedRef = useRef(!isConnected)

  // Auto-close modal when connection is successful
  useEffect(() => {
    if (wasDisconnectedRef.current && isConnected) {
      // Connection successful - close the modal after a brief delay for feedback
      const timer = setTimeout(() => {
        hideModal()
      }, 500)
      return () => clearTimeout(timer)
    }
    // Update ref when connection status changes
    wasDisconnectedRef.current = !isConnected
  }, [isConnected, hideModal])

  const handleDisconnect = () => {
    disconnectWallet()
    hideModal()
  }

  const handleToggleClearPath = () => {
    setClearPathStatus(!preferences.clearPathStatus.active)
  }

  const handleToggleDemoMode = () => {
    setDemoMode(!preferences.demoMode)
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    // TODO: Implement market search navigation
    console.log('Searching for:', searchQuery)
  }

  const handleLaunchMarket = () => {
    // TODO: Implement launch market navigation
    hideModal()
    console.log('Navigate to launch market')
  }

  const handleOpenPurchaseModal = () => {
    showModal(<RolePurchaseModal onClose={hideModal} />, {
      title: '',
      size: 'large',
      closable: false
    })
  }

  const handleNavigateToClearPath = () => {
    hideModal()
    navigate('/clearpath')
  }

  const handleNavigateToAdmin = () => {
    hideModal()
    navigate('/admin/roles')
  }

  const shortenAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  return (
    <div className="user-management-modal">
      {isConnected && (
        <div className="modal-header-section">
          <div className="wallet-info-header">
            <BlockiesAvatar address={address} size={40} className="wallet-avatar" />
            <span className="wallet-address-display">{shortenAddress(address)}</span>
            <span className={`status-dot ${isConnected ? 'connected' : ''}`} aria-hidden="true"></span>
          </div>
        </div>
      )}

      {!isConnected ? (
        <div className="connect-section">
          <div className="connect-prompt">
            <div className="connect-icon" aria-hidden="true">🔗</div>
            <h3>Connect Your Wallet</h3>
            <p>Connect your Web3 wallet to access all features, manage your preferences, and interact with markets.</p>
            
            <div className="connector-options">
              <WalletButton 
                theme="dark"
              />
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
          {/* Tab Navigation */}
          <div className="tabs" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === 'profile'}
              className={`tab ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              Profile
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'search'}
              className={`tab ${activeTab === 'search' ? 'active' : ''}`}
              onClick={() => setActiveTab('search')}
            >
              Search Markets
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'swap'}
              className={`tab ${activeTab === 'swap' ? 'active' : ''}`}
              onClick={() => setActiveTab('swap')}
            >
              Swap Tokens
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'launch'}
              className={`tab ${activeTab === 'launch' ? 'active' : ''}`}
              onClick={() => setActiveTab('launch')}
            >
              Launch Market
            </button>
          </div>

          {/* Tab Content */}
          <div className="tab-content">
            {activeTab === 'profile' && (
              <div className="profile-section" role="tabpanel">
                <div className="section">
                  <h3>Wallet</h3>
                  <div className="wallet-details">
                    <div className="detail-row">
                      <span className="label">Address:</span>
                      <span className="value">{address}</span>
                    </div>
                    <button 
                      onClick={handleDisconnect}
                      className="disconnect-btn"
                    >
                      Disconnect Wallet
                    </button>
                  </div>
                </div>

                <div className="section">
                  <h3>ClearPath Status</h3>
                  <div className="clearpath-status-section">
                    <div className="status-display">
                      <span className={`status-badge ${preferences.clearPathStatus.active ? 'active' : 'inactive'}`}>
                        {preferences.clearPathStatus.active ? 'Active' : 'Inactive'}
                      </span>
                      {preferences.clearPathStatus.lastUpdated && (
                        <span className="last-updated">
                          Updated: {new Date(preferences.clearPathStatus.lastUpdated).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <button 
                      onClick={handleToggleClearPath}
                      className="toggle-status-btn"
                    >
                      {preferences.clearPathStatus.active ? 'Deactivate' : 'Activate'} ClearPath
                    </button>
                    <p className="clearpath-description">
                      ClearPath provides institutional-grade governance through prediction markets. 
                      {preferences.clearPathStatus.active 
                        ? ' You have access to advanced governance features.'
                        : ' Activate to access governance features.'}
                    </p>
                  </div>
                </div>

                <div className="section">
                  <h3>Preferences</h3>
                  <div className="preferences-info">
                    <div className="pref-item">
                      <span className="pref-label">Favorite Markets:</span>
                      <span className="pref-value">{preferences.favoriteMarkets.length}</span>
                    </div>
                    <div className="pref-item">
                      <span className="pref-label">Default Slippage:</span>
                      <span className="pref-value">{preferences.defaultSlippage}%</span>
                    </div>
                  </div>
                </div>

                <div className="section">
                  <h3>Data Source</h3>
                  <div className="demo-mode-section">
                    <div className="status-display">
                      <span className={`status-badge ${preferences.demoMode ? 'demo' : 'live'}`}>
                        {preferences.demoMode ? 'Demo Mode' : 'Live Mode'}
                      </span>
                    </div>
                    <button 
                      onClick={handleToggleDemoMode}
                      className="toggle-demo-btn"
                    >
                      Switch to {preferences.demoMode ? 'Live' : 'Demo'} Mode
                    </button>
                    <p className="demo-mode-description">
                      {preferences.demoMode 
                        ? <><span aria-hidden="true">🎭</span> Demo Mode: Using mock data for testing and demonstrations. Switch to Live Mode to interact with real blockchain data.</>
                        : <><span aria-hidden="true">🌐</span> Live Mode: Connected to testnet blockchain. All transactions are real and require gas fees.</>}
                    </p>
                  </div>
                </div>

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
                      <p>You don't have any special roles yet.</p>
                      <button 
                        onClick={handleOpenPurchaseModal}
                        className="get-roles-btn"
                      >
                        Get Premium Access
                      </button>
                    </div>
                  )}
                </div>

                {hasRole(ROLES.CLEARPATH_USER) && (
                  <div className="section clearpath-management-section">
                    <h3>ClearPath Management</h3>
                    <p className="section-description">
                      Access DAO governance and management features
                    </p>
                    <button 
                      onClick={handleNavigateToClearPath}
                      className="manage-org-btn"
                    >
                      Manage Organizations
                    </button>
                  </div>
                )}

                {hasRole(ROLES.ADMIN) && (
                  <div className="section admin-section">
                    <h3>Administration</h3>
                    <p className="section-description">
                      Manage roles and permissions for users
                    </p>
                    <button 
                      onClick={handleNavigateToAdmin}
                      className="admin-panel-btn"
                    >
                      Role Management
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'search' && (
              <div className="search-section" role="tabpanel">
                <h3>Search Markets</h3>
                <form onSubmit={handleSearchSubmit} className="search-form">
                  <div className="search-input-group">
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search for markets..."
                      className="search-input"
                      aria-label="Search markets"
                    />
                    <button type="submit" className="search-btn">
                      Search
                    </button>
                  </div>
                </form>

                {preferences.recentSearches.length > 0 && (
                  <div className="recent-searches">
                    <h4>Recent Searches</h4>
                    <ul className="search-list">
                      {preferences.recentSearches.slice(0, 5).map((search, index) => (
                        <li key={index} className="search-item">
                          <button
                            onClick={() => setSearchQuery(search)}
                            className="search-item-btn"
                          >
                            {search}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="search-help">
                  <p>Search for prediction markets by title, category, or description.</p>
                </div>
              </div>
            )}

            {activeTab === 'swap' && (
              <div className="swap-section" role="tabpanel">
                <SwapPanel />
              </div>
            )}

            {activeTab === 'launch' && (
              <div className="launch-section" role="tabpanel">
                <h3>Launch a New Market</h3>
                <div className="launch-content">
                  <div className="launch-icon" aria-hidden="true">🚀</div>
                  <p className="launch-description">
                    Create and launch your own prediction market. Define the question, 
                    set the parameters, and let the community predict the outcome.
                  </p>
                  <button 
                    onClick={handleLaunchMarket}
                    className="launch-market-btn"
                  >
                    Launch New Market
                  </button>
                  <div className="launch-help">
                    <h4>Requirements:</h4>
                    <ul>
                      <li>Connected wallet with sufficient funds</li>
                      <li>Clear market question and resolution criteria</li>
                      <li>Initial liquidity for the market</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default UserManagementModal
