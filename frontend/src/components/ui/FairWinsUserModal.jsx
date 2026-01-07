import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet, useWalletConnection, useWalletRoles, useTheme } from '../../hooks'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useModal } from '../../hooks/useUI'
import { usePrice } from '../../contexts/PriceContext'
import { ROLES, ROLE_INFO } from '../../contexts/RoleContext'
import SwapPanel from '../fairwins/SwapPanel'
import PremiumPurchaseModal from './PremiumPurchaseModal'
import BlockiesAvatar from './BlockiesAvatar'
import './FairWinsUserModal.css'

/**
 * FairWinsUserModal - Comprehensive user management modal
 * 
 * Features:
 * - User profile and wallet management
 * - Theme switching (light/dark mode)
 * - Platform switching (FairWins/ClearPath)
 * - Currency display toggle (USD/ETC)
 * - Role management and purchasing
 * - Demo mode toggle
 * - ClearPath status management
 * - Market search
 * - Token swap integration
 * - Market creation launch
 * 
 * @param {Function} onScanMarket - Callback for market scanning
 */
function FairWinsUserModal({ onScanMarket }) {
  const { address, isConnected } = useWallet()
  const { disconnectWallet } = useWalletConnection()
  const { hideModal, showModal } = useModal()
  const { preferences, setDemoMode } = useUserPreferences()
  const { roles, hasRole } = useWalletRoles()
  const { mode, toggleMode, isDark, platform, setThemePlatform, isClearPath } = useTheme()
  const { showUsd, toggleCurrency, formatPrice } = usePrice()
  const navigate = useNavigate()
  
  const [activeTab, setActiveTab] = useState('profile')
  const [searchQuery, setSearchQuery] = useState('')

  // If somehow opened without a connection, just close to avoid empty UI
  if (!isConnected) {
    hideModal()
    return null
  }

  // === Event Handlers ===
  
  const handleDisconnect = () => {
    disconnectWallet()
    hideModal()
  }

  const handleToggleDemoMode = () => {
    setDemoMode(!preferences.demoMode)
  }

  const handleTogglePlatform = () => {
    setThemePlatform(isClearPath ? 'fairwins' : 'clearpath')
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      hideModal()
      navigate(`/markets?search=${encodeURIComponent(searchQuery)}`)
    }
  }

  const handleLaunchMarket = () => {
    hideModal()
    navigate('/markets/create')
  }

  const handleOpenPurchaseModal = () => {
    showModal(<PremiumPurchaseModal onClose={hideModal} />, {
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

  const shortenAddress = (addr) => {
    if (!addr) return ''
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`
  }

  // === Tab Configuration ===
  const tabs = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
    { id: 'search', label: 'Search', icon: '🔍' },
    { id: 'swap', label: 'Swap', icon: '🔄' },
    { id: 'launch', label: 'Launch', icon: '🚀' }
  ]

  return (
    <div className="fairwins-user-modal">
      {/* Header Section */}
      <header className="fwum-header">
        <div className="fwum-wallet-info">
          <BlockiesAvatar address={address} size={48} className="fwum-avatar" />
          <div className="fwum-wallet-details">
            <span className="fwum-address">{shortenAddress(address)}</span>
            <span className="fwum-address-full">{address}</span>
            <div className="fwum-connection-status">
              <span className="fwum-status-dot connected" aria-hidden="true" />
              <span className="fwum-status-text">Connected</span>
            </div>
          </div>
        </div>
        <button 
          onClick={handleDisconnect} 
          className="fwum-disconnect-btn"
          aria-label="Disconnect wallet"
        >
          <span aria-hidden="true">🔌</span>
          Disconnect
        </button>
      </header>

      {/* Tab Navigation */}
      <nav className="fwum-tabs" role="tablist" aria-label="User modal sections">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            className={`fwum-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="fwum-tab-icon" aria-hidden="true">{tab.icon}</span>
            <span className="fwum-tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <div className="fwum-content">
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div id="panel-profile" role="tabpanel" className="fwum-panel">
            {/* Wallet Section */}
            <section className="fwum-section">
              <h3 className="fwum-section-title">
                <span aria-hidden="true">👛</span> Wallet
              </h3>
              <div className="fwum-wallet-card">
                <div className="fwum-info-row">
                  <span className="fwum-label">Address</span>
                  <span className="fwum-value fwum-monospace">{address}</span>
                </div>
              </div>
            </section>

            {/* Data Source */}
            <section className="fwum-section">
              <h3 className="fwum-section-title">
                <span aria-hidden="true">📡</span> Data Source
              </h3>
              <div className="fwum-datasource-card">
                <div className="fwum-status-row">
                  <span className={`fwum-mode-badge ${preferences.demoMode ? 'demo' : 'live'}`}>
                    <span aria-hidden="true">{preferences.demoMode ? '🎭' : '🌐'}</span>
                    {preferences.demoMode ? 'Demo Mode' : 'Live Mode'}
                  </span>
                </div>
                <p className="fwum-description">
                  {preferences.demoMode 
                    ? 'Using mock data for testing and demonstrations. Switch to Live Mode to interact with real blockchain data.'
                    : 'Connected to testnet blockchain. All transactions are real and require gas fees.'}
                </p>
                <button 
                  onClick={handleToggleDemoMode}
                  className="fwum-action-btn secondary"
                >
                  Switch to {preferences.demoMode ? 'Live' : 'Demo'} Mode
                </button>
              </div>
            </section>

            {/* Your Roles */}
            <section className="fwum-section">
              <h3 className="fwum-section-title">
                <span aria-hidden="true">🏆</span> Your Roles
              </h3>
              {roles.length > 0 ? (
                <div className="fwum-roles-list">
                  {roles.map(role => {
                    const roleInfo = ROLE_INFO[role]
                    return (
                      <div key={role} className="fwum-role-card">
                        <div className="fwum-role-header">
                          <span className="fwum-role-badge">{roleInfo?.name || role}</span>
                          {roleInfo?.premium && (
                            <span className="fwum-premium-badge">
                              <span aria-hidden="true">⭐</span> Premium
                            </span>
                          )}
                        </div>
                        <p className="fwum-role-description">
                          {roleInfo?.description || 'No description'}
                        </p>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="fwum-no-roles">
                  <span className="fwum-no-roles-icon" aria-hidden="true">🔐</span>
                  <p>You don't have any special roles yet.</p>
                  <button 
                    onClick={handleOpenPurchaseModal}
                    className="fwum-premium-btn"
                  >
                    <span aria-hidden="true">✨</span>
                    Get Premium Access
                  </button>
                </div>
              )}
            </section>

            {/* ClearPath Management (for ClearPath users) */}
            {hasRole(ROLES.CLEARPATH_USER) && (
              <section className="fwum-section fwum-clearpath-section">
                <h3 className="fwum-section-title">
                  <span aria-hidden="true">🏛️</span> ClearPath Management
                </h3>
                <p className="fwum-description">
                  Access DAO governance and management features
                </p>
                <button 
                  onClick={handleNavigateToClearPath}
                  className="fwum-action-btn primary"
                >
                  Manage Organizations
                </button>
              </section>
            )}

            {/* Admin Section (for admins) */}
            {hasRole(ROLES.ADMIN) && (
              <section className="fwum-section fwum-admin-section">
                <h3 className="fwum-section-title">
                  <span aria-hidden="true">⚡</span> Administration
                </h3>
                <p className="fwum-description">
                  Manage roles and permissions for users
                </p>
                <button 
                  onClick={handleNavigateToAdmin}
                  className="fwum-action-btn danger"
                >
                  Role Management
                </button>
              </section>
            )}

            {/* Preferences Summary */}
            <section className="fwum-section">
              <h3 className="fwum-section-title">
                <span aria-hidden="true">📊</span> Quick Stats
              </h3>
              <div className="fwum-stats-grid">
                <div className="fwum-stat-card">
                  <span className="fwum-stat-label">Favorite Markets</span>
                  <span className="fwum-stat-value">{preferences.favoriteMarkets?.length || 0}</span>
                </div>
                <div className="fwum-stat-card">
                  <span className="fwum-stat-label">Default Slippage</span>
                  <span className="fwum-stat-value">{preferences.defaultSlippage || 0.5}%</span>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div id="panel-settings" role="tabpanel" className="fwum-panel">
            {/* Appearance Section */}
            <section className="fwum-section">
              <h3 className="fwum-section-title">
                <span aria-hidden="true">🎨</span> Appearance
              </h3>
              
              {/* Theme Toggle */}
              <div className="fwum-setting-item">
                <div className="fwum-setting-info">
                  <span className="fwum-setting-icon" aria-hidden="true">
                    {isDark ? '🌙' : '☀️'}
                  </span>
                  <div className="fwum-setting-text">
                    <strong>Theme</strong>
                    <p>Switch between light and dark mode</p>
                  </div>
                </div>
                <button
                  className="fwum-toggle-btn"
                  onClick={toggleMode}
                  aria-pressed={isDark}
                  aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
                >
                  <span className="fwum-toggle-track">
                    <span className={`fwum-toggle-thumb ${isDark ? 'active' : ''}`} />
                  </span>
                  <span className="fwum-toggle-label">{isDark ? 'Dark' : 'Light'}</span>
                </button>
              </div>

              {/* Platform Toggle */}
              <div className="fwum-setting-item">
                <div className="fwum-setting-info">
                  <span className="fwum-setting-icon" aria-hidden="true">
                    {isClearPath ? '🏛️' : '🎯'}
                  </span>
                  <div className="fwum-setting-text">
                    <strong>Platform Style</strong>
                    <p>Choose platform-specific styling</p>
                  </div>
                </div>
                <button
                  className="fwum-toggle-btn"
                  onClick={handleTogglePlatform}
                  aria-pressed={isClearPath}
                  aria-label={`Switch to ${isClearPath ? 'FairWins' : 'ClearPath'} style`}
                >
                  <span className="fwum-toggle-track platform">
                    <span className={`fwum-toggle-thumb ${isClearPath ? 'active' : ''}`} />
                  </span>
                  <span className="fwum-toggle-label">{isClearPath ? 'ClearPath' : 'FairWins'}</span>
                </button>
              </div>
            </section>

            {/* Display Section */}
            <section className="fwum-section">
              <h3 className="fwum-section-title">
                <span aria-hidden="true">💱</span> Display Currency
              </h3>
              
              <div className="fwum-setting-item">
                <div className="fwum-setting-info">
                  <span className="fwum-setting-icon" aria-hidden="true">
                    {showUsd ? '💵' : '⚡'}
                  </span>
                  <div className="fwum-setting-text">
                    <strong>Currency</strong>
                    <p>Toggle between USD and ETC display</p>
                  </div>
                </div>
                <button
                  className="fwum-toggle-btn"
                  onClick={toggleCurrency}
                  aria-pressed={showUsd}
                  aria-label={`Switch to ${showUsd ? 'ETC' : 'USD'} display`}
                >
                  <span className="fwum-toggle-track currency">
                    <span className={`fwum-toggle-thumb ${showUsd ? 'active' : ''}`} />
                  </span>
                  <span className="fwum-toggle-label">{showUsd ? 'USD' : 'ETC'}</span>
                </button>
              </div>
            </section>

            {/* Data & Privacy Section */}
            <section className="fwum-section">
              <h3 className="fwum-section-title">
                <span aria-hidden="true">🔒</span> Data & Privacy
              </h3>
              
              {/* Demo Mode Toggle */}
              <div className="fwum-setting-item">
                <div className="fwum-setting-info">
                  <span className="fwum-setting-icon" aria-hidden="true">
                    {preferences.demoMode ? '🎭' : '🌐'}
                  </span>
                  <div className="fwum-setting-text">
                    <strong>Data Mode</strong>
                    <p>{preferences.demoMode ? 'Using simulated data' : 'Connected to live blockchain'}</p>
                  </div>
                </div>
                <button
                  className="fwum-toggle-btn"
                  onClick={handleToggleDemoMode}
                  aria-pressed={preferences.demoMode}
                  aria-label={`Switch to ${preferences.demoMode ? 'live' : 'demo'} mode`}
                >
                  <span className="fwum-toggle-track data">
                    <span className={`fwum-toggle-thumb ${preferences.demoMode ? 'active' : ''}`} />
                  </span>
                  <span className="fwum-toggle-label">{preferences.demoMode ? 'Demo' : 'Live'}</span>
                </button>
              </div>

            {/* Wallet Section */}
            <section className="fwum-section">
              <h3 className="fwum-section-title">
                <span aria-hidden="true">👛</span> Wallet Connection
              </h3>
              <div className="fwum-wallet-status-card">
                <div className="fwum-wallet-connected">
                  <span className="fwum-wallet-status-icon connected" aria-hidden="true">✓</span>
                  <div className="fwum-wallet-status-info">
                    <strong>Connected</strong>
                    <span className="fwum-wallet-address">{shortenAddress(address)}</span>
                  </div>
                </div>
                <button 
                  onClick={handleDisconnect}
                  className="fwum-disconnect-settings-btn"
                >
                  Disconnect
                </button>
              </div>
            </section>
          </div>
        )}

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div id="panel-search" role="tabpanel" className="fwum-panel">
            <section className="fwum-section">
              <h3 className="fwum-section-title">
                <span aria-hidden="true">🔍</span> Search Markets
              </h3>
              <form onSubmit={handleSearchSubmit} className="fwum-search-form">
                <div className="fwum-search-input-group">
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for markets..."
                    className="fwum-search-input"
                    aria-label="Search markets"
                  />
                  <button type="submit" className="fwum-search-btn">
                    <span aria-hidden="true">🔍</span>
                    Search
                  </button>
                </div>
              </form>

              {preferences.recentSearches?.length > 0 && (
                <div className="fwum-recent-searches">
                  <h4>Recent Searches</h4>
                  <ul className="fwum-search-list">
                    {preferences.recentSearches.slice(0, 5).map((search, index) => (
                      <li key={index}>
                        <button
                          onClick={() => setSearchQuery(search)}
                          className="fwum-search-item"
                        >
                          <span aria-hidden="true">🕐</span>
                          {search}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="fwum-search-help">
                <span className="fwum-help-icon" aria-hidden="true">💡</span>
                <p>Search for prediction markets by title, category, or description.</p>
              </div>
            </section>
          </div>
        )}

        {/* Swap Tab */}
        {activeTab === 'swap' && (
          <div id="panel-swap" role="tabpanel" className="fwum-panel fwum-panel-swap">
            <SwapPanel />
          </div>
        )}

        {/* Launch Tab */}
        {activeTab === 'launch' && (
          <div id="panel-launch" role="tabpanel" className="fwum-panel">
            <section className="fwum-section fwum-launch-section">
              <div className="fwum-launch-content">
                <div className="fwum-launch-icon" aria-hidden="true">🚀</div>
                <h3>Launch a New Market</h3>
                <p className="fwum-launch-description">
                  Create and launch your own prediction market. Define the question, 
                  set the parameters, and let the community predict the outcome.
                </p>
                <button 
                  onClick={handleLaunchMarket}
                  className="fwum-launch-btn"
                >
                  <span aria-hidden="true">✨</span>
                  Create New Market
                </button>
                
                <div className="fwum-launch-requirements">
                  <h4>
                    <span aria-hidden="true">📋</span> Requirements
                  </h4>
                  <ul>
                    <li>
                      <span aria-hidden="true">✓</span>
                      Connected wallet with sufficient funds
                    </li>
                    <li>
                      <span aria-hidden="true">✓</span>
                      Clear market question and resolution criteria
                    </li>
                    <li>
                      <span aria-hidden="true">✓</span>
                      Initial liquidity for the market
                    </li>
                  </ul>
                </div>

                {hasRole(ROLES.MARKET_MAKER) && (
                  <div className="fwum-market-maker-badge">
                    <span aria-hidden="true">⭐</span>
                    You have Market Maker privileges
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

export default FairWinsUserModal
