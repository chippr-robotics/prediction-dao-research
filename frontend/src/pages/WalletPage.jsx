import { useState, useCallback, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useWallet, useWalletConnection, useWalletRoles } from '../hooks'
import { useEncryption } from '../hooks/useEncryption'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { usePwaInstall } from '../hooks/usePwaInstall'
import { usePwaUpdate } from '../hooks/usePwaUpdate'
import { useChainTokens } from '../hooks/useChainTokens'
import { useModal } from '../hooks/useUI'
import { ROLES, ROLE_INFO } from '../contexts/RoleContext'
import { hasRegisteredKey, ensureKeyRegistered } from '../utils/keyRegistryService'
import SwapPanel from '../components/fairwins/SwapPanel'
import PayTransferPanel from '../components/wallet/PayTransferPanel'
import TokensPanel from '../components/tokens/TokensPanel'
import ClearPathPanel from '../components/clearpath/ClearPathPanel'
import AccountDashboard from '../components/account/AccountDashboard'
import AddressBookPanel from '../components/account/AddressBookPanel'
import BackupPanel from '../components/account/BackupPanel'
import RecoveryCodesPanel from '../components/account/RecoveryCodesPanel'
import NetworkSettings from '../components/wallet/NetworkSettings'
import TaxReportsPanel from '../components/wallet/TaxReportsPanel'
import PortalNav from '../components/ui/PortalNav'
import PremiumPurchaseModal from '../components/ui/PremiumPurchaseModal'
import BlockiesAvatar from '../components/ui/BlockiesAvatar'
import LoadingScreen from '../components/ui/LoadingScreen'
import { getWalletLabel, getWalletIcon } from '../utils/walletLabel'
import './WalletPage.css'

// My Account sections, shown via the WalletTabMenu kebab menu.
const WALLET_TABS = [
  { id: 'account', label: 'Account' },
  { id: 'paytransfer', label: 'Pay & Transfer' },
  { id: 'addressbook', label: 'Address Book' },
  { id: 'backup', label: 'Backup' },
  { id: 'membership', label: 'Membership' },
  { id: 'network', label: 'Network' },
  { id: 'security', label: 'Security' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'reports', label: 'Reporting' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'clearpath', label: 'ClearPath' },
  { id: 'swap', label: 'Swap' },
]

// Connector labels are resolved through the shared, vendor-neutral helper so
// the generic injected option reads "Browser Wallet" rather than assuming a
// specific vendor like MetaMask.
const getConnectorInfo = (connector) => {
  return `${getWalletIcon(connector)} ${getWalletLabel(connector)}`
}

// Canonical Polymarket category slugs — kept here to keep WalletPage
// self-contained. Order matches PolymarketBrowser's quick-filter row.
const POLYMARKET_CATEGORY_OPTIONS = [
  { slug: 'politics', label: 'Politics' },
  { slug: 'sports', label: 'Sports' },
  { slug: 'crypto', label: 'Crypto' },
  { slug: 'pop-culture', label: 'Pop Culture' },
  { slug: 'business', label: 'Business' },
  { slug: 'science', label: 'Science' },
  { slug: 'entertainment', label: 'Entertainment' },
  { slug: 'tech', label: 'Tech' },
]

function WalletPage() {
  const { address, isConnected, connectors, provider, signer } = useWallet()
  const { connectWallet } = useWalletConnection()
  const { showModal, hideModal } = useModal()
  const { roles, hasRole } = useWalletRoles()
  const { isInitialized, isInitializing, ensureInitialized } = useEncryption()
  const { preferences, setPolymarketCategories } = useUserPreferences()
  const { capabilities } = useChainTokens()
  const polymarketSidebetsEnabled = Boolean(capabilities?.polymarketSidebets)
  const {
    isStandalone: pwaStandalone,
    canPrompt: pwaCanPrompt,
    isIos: pwaIsIos,
    hidden: pwaPromptHidden,
    setHidden: setPwaPromptHidden,
    promptInstall: pwaPromptInstall,
  } = usePwaInstall()
  const { updateReady: pwaUpdateReady, applyUpdate: pwaApplyUpdate, checkForUpdate: pwaCheckForUpdate } = usePwaUpdate()
  const [pwaChecking, setPwaChecking] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Allow deep-linking straight to a section (e.g. the update toast → ?tab=preferences).
  const [activeTab, setActiveTab] = useState(() => {
    const requested = searchParams.get('tab')
    return WALLET_TABS.some((t) => t.id === requested) ? requested : 'account'
  })
  // On phones the section nav is a slide-over drawer that overlays the content,
  // so it starts closed; on wider screens it stays docked open like a portal.
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  )
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobile)
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

  const handleOpenPurchaseModal = () => {
    showModal(<PremiumPurchaseModal onClose={hideModal} />, {
      title: '',
      size: 'large',
      closable: false
    })
  }

  const handleNavigateToAdmin = () => {
    navigate('/admin')
  }

  const handleCheckKeyStatus = useCallback(async () => {
    if (!address || !provider) return
    setKeyCheckLoading(true)
    setKeyError(null)
    try {
      const registered = await hasRegisteredKey(address, provider)
      setKeyRegistered(registered)
    } catch (err) {
      setKeyError('Could not check key status: ' + err.message)
    } finally {
      setKeyCheckLoading(false)
    }
  }, [address, provider])

  const handleRegisterKey = useCallback(async () => {
    if (!signer || !address) {
      setKeyError('Wallet not connected. Please reconnect.')
      return
    }
    setKeyRegisterLoading(true)
    setKeyError(null)
    try {
      const result = await ensureInitialized()
      if (!result?.publicKey) {
        throw new Error('Failed to derive encryption keys')
      }
      // ensureKeyRegistered checks on-chain first, only registers if needed
      const wasNewlyRegistered = await ensureKeyRegistered(signer, address, result.publicKey)
      setKeyRegistered(true)
      if (!wasNewlyRegistered) {
        // Key was already registered — not an error, just inform user
        console.log('[WalletPage] Key was already registered on-chain')
      }
    } catch (err) {
      if (err.message.includes('rejected') || err.message.includes('denied')) {
        setKeyError('Transaction was rejected.')
      } else if (err.message.includes('KeyAlreadyExists') || err.message.includes('0xe0accd63')) {
        // Key already exists on-chain — treat as success
        setKeyRegistered(true)
      } else {
        setKeyError('Key registration failed: ' + err.message)
      }
    } finally {
      setKeyRegisterLoading(false)
    }
  }, [ensureInitialized, signer, address])

  // Auto-check key status when Security tab is shown
  useEffect(() => {
    if (activeTab === 'security' && isConnected && keyRegistered === null) {
      handleCheckKeyStatus()
    }
  }, [activeTab, isConnected, keyRegistered, handleCheckKeyStatus])

  // Track viewport so the section nav can dock (desktop) or slide over (mobile).
  // Crossing the breakpoint resets the drawer to its natural state for that size.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 768px)')
    const handleChange = (event) => {
      setIsMobile(event.matches)
      setSidebarOpen(!event.matches)
    }
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [])

  // Close the slide-over drawer on Escape (mobile only).
  useEffect(() => {
    if (!isMobile || !sidebarOpen) return
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isMobile, sidebarOpen])

  // Jumping to a section closes the drawer on mobile so the content is visible.
  const handleSelectTab = useCallback((id) => {
    setActiveTab(id)
    if (isMobile) setSidebarOpen(false)
  }, [isMobile])

  const handleCheckForUpdate = useCallback(async () => {
    setPwaChecking(true)
    try {
      await pwaCheckForUpdate()
    } finally {
      setPwaChecking(false)
    }
  }, [pwaCheckForUpdate])

  // When routed here from the update toast (#pwa-update), reveal the section.
  useEffect(() => {
    if (activeTab !== 'preferences') return
    if (typeof window === 'undefined' || window.location.hash !== '#pwa-update') return
    const id = window.setTimeout(() => {
      document.getElementById('pwa-update')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
    return () => window.clearTimeout(id)
  }, [activeTab])

  const selectedPolymarketCategories = useMemo(
    () => preferences?.polymarketCategories || [],
    [preferences?.polymarketCategories],
  )

  const togglePolymarketCategory = useCallback((slug) => {
    if (!isConnected) return
    const next = selectedPolymarketCategories.includes(slug)
      ? selectedPolymarketCategories.filter((s) => s !== slug)
      : [...selectedPolymarketCategories, slug]
    setPolymarketCategories(next)
  }, [isConnected, selectedPolymarketCategories, setPolymarketCategories])

  const shortenAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  const activeTabLabel = (WALLET_TABS.find((t) => t.id === activeTab) || WALLET_TABS[0]).label

  return (
    <div className="wallet-page-wrapper">
      <div className="wallet-page">

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
                    className="install-wallet-link"
                  >
                    Learn about Web3 wallets
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className={`wallet-portal portal-shell ${sidebarOpen ? '' : 'portal-collapsed'}`}>
              <aside
                id="wallet-portal-nav"
                className="portal-sidebar wallet-portal-sidebar"
              >
                <div className="wallet-portal-identity">
                  <BlockiesAvatar address={address} size={36} className="wallet-avatar" />
                  <span className="wallet-address-display">{shortenAddress(address)}</span>
                  <span className="status-dot connected" aria-hidden="true"></span>
                </div>
                <PortalNav
                  items={WALLET_TABS}
                  activeId={activeTab}
                  onSelect={handleSelectTab}
                  ariaLabel="Account sections"
                />
              </aside>

              {/* Mobile only: dim + dismiss the slide-over drawer by tapping outside it. */}
              {isMobile && sidebarOpen && (
                <button
                  type="button"
                  className="wallet-portal-backdrop"
                  aria-label="Close menu"
                  onClick={() => setSidebarOpen(false)}
                />
              )}

              <div className="portal-main wallet-portal-main">
                <div className="wallet-portal-topbar">
                  <button
                    type="button"
                    className="portal-sidebar-toggle"
                    aria-expanded={sidebarOpen}
                    aria-controls="wallet-portal-nav"
                    aria-label={sidebarOpen ? 'Hide menu' : 'Show menu'}
                    onClick={() => setSidebarOpen((o) => !o)}
                  >
                    <span aria-hidden="true">{'☰'}</span>
                  </button>
                  <span className="wallet-portal-current">{activeTabLabel}</span>
                </div>

                <div className="tab-content">
                {activeTab === 'account' && (
                  <div className="profile-section" role="tabpanel">
                    <AccountDashboard address={address} />

                    {hasRole(ROLES.ADMIN) && (
                      <div className="section admin-section">
                        <h3>Administration</h3>
                        <p className="section-description">Manage roles and permissions for users</p>
                        <button onClick={handleNavigateToAdmin} className="admin-panel-btn">Role Management</button>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'paytransfer' && (
                  <div className="paytransfer-section" role="tabpanel">
                    <PayTransferPanel />
                  </div>
                )}

                {activeTab === 'addressbook' && (
                  <div className="addressbook-section" role="tabpanel">
                    <AddressBookPanel address={address} />
                  </div>
                )}

                {activeTab === 'backup' && (
                  <div className="backup-section" role="tabpanel">
                    <BackupPanel />
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
                      {hasRole(ROLES.WAGER_PARTICIPANT) ? (
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

                {activeTab === 'network' && (
                  <div className="network-section" role="tabpanel">
                    <NetworkSettings />
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

                    <RecoveryCodesPanel />
                  </div>
                )}

                {activeTab === 'preferences' && (
                  <div className="preferences-section" role="tabpanel">
                    <div className="section">
                      <h3>Install App</h3>
                      <p className="section-description">
                        FairWins is a progressive web app you can install to your device for
                        quick, full-screen access — no app store, no download.
                      </p>

                      {pwaStandalone ? (
                        <div className="key-status" role="note">
                          FairWins is already installed and running as an app on this device.
                        </div>
                      ) : (
                        <>
                          <label className="pwa-pref-toggle">
                            <input
                              type="checkbox"
                              checked={!pwaPromptHidden}
                              onChange={(e) => setPwaPromptHidden(!e.target.checked)}
                            />
                            <span>Show the install prompt when I visit in a browser</span>
                          </label>

                          {pwaCanPrompt && (
                            <button
                              type="button"
                              className="key-action-btn primary"
                              onClick={pwaPromptInstall}
                            >
                              Install now
                            </button>
                          )}

                          {pwaIsIos && !pwaCanPrompt && (
                            <p className="section-description">
                              On iOS, open the Share menu in Safari and choose{' '}
                              <strong>Add to Home Screen</strong> to install.
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    <div className="section" id="pwa-update">
                      <h3>Software Update</h3>
                      <p className="section-description">
                        FairWins checks for new versions automatically in the background.
                        When an update is ready you can install it here — it takes a moment
                        and reloads the app.
                      </p>

                      <div
                        className={`pwa-update-status ${pwaUpdateReady ? 'is-available' : 'is-current'}`}
                        role="status"
                      >
                        {pwaUpdateReady
                          ? 'A new version is available.'
                          : "You're running the latest version."}
                      </div>

                      <div className="pwa-update-buttons">
                        {pwaUpdateReady && (
                          <button
                            type="button"
                            className="key-action-btn primary"
                            onClick={pwaApplyUpdate}
                          >
                            Update now
                          </button>
                        )}
                        <button
                          type="button"
                          className="key-action-btn secondary"
                          onClick={handleCheckForUpdate}
                          disabled={pwaChecking}
                        >
                          {pwaChecking ? 'Checking…' : 'Check for updates'}
                        </button>
                      </div>
                    </div>

                    <div className="section">
                      <h3>Polymarket Categories</h3>
                      <p className="section-description">
                        Pick the categories you care about. Your dashboard feed will surface markets in these categories first, and the in-wager market browser uses them as the default filter.
                      </p>

                      {!polymarketSidebetsEnabled && (
                        <div className="key-error" role="note">
                          Polymarket integration is only available on Polygon chains. Switch your network to use these preferences.
                        </div>
                      )}

                      <div className="polymarket-category-grid">
                        {POLYMARKET_CATEGORY_OPTIONS.map(({ slug, label }) => {
                          const checked = selectedPolymarketCategories.includes(slug)
                          return (
                            <label key={slug} className={`polymarket-category-option ${checked ? 'checked' : ''}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePolymarketCategory(slug)}
                              />
                              <span>{label}</span>
                            </label>
                          )
                        })}
                      </div>

                      {selectedPolymarketCategories.length > 0 && (
                        <button
                          type="button"
                          className="key-action-btn secondary"
                          onClick={() => setPolymarketCategories([])}
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'reports' && (
                  <div className="reports-section" role="tabpanel">
                    <TaxReportsPanel />
                  </div>
                )}

                {activeTab === 'tokens' && (
                  <div className="tokens-section" role="tabpanel">
                    <TokensPanel />
                  </div>
                )}
                {activeTab === 'clearpath' && (
                  <div className="clearpath-section" role="tabpanel">
                    <ClearPathPanel />
                  </div>
                )}
                {activeTab === 'swap' && (
                  <div className="swap-section" role="tabpanel">
                    <SwapPanel />
                  </div>
                )}
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  )
}

export default WalletPage
