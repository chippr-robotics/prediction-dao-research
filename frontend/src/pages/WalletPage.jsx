import { useState, useCallback, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useWallet, useWalletRoles } from '../hooks'
import { useEncryption } from '../hooks/useEncryption'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { usePwaInstall } from '../hooks/usePwaInstall'
import { usePwaUpdate } from '../hooks/usePwaUpdate'
import { useChainTokens } from '../hooks/useChainTokens'
import { useModal } from '../hooks/useUI'
import { ROLES, ROLE_INFO } from '../contexts/RoleContext'
import { hasRegisteredKey, ensureKeyRegistered } from '../utils/keyRegistryService'
import TradePanel from '../components/fairwins/TradePanel'
import EarnPanel from '../components/earn/EarnPanel'
import PayTransferPanel from '../components/wallet/PayTransferPanel'
import PortfolioPanel from '../components/wallet/PortfolioPanel'
import CustodyPanel from '../components/custody/CustodyPanel'
import TokensPanel from '../components/tokens/TokensPanel'
import ClearPathPanel from '../components/clearpath/ClearPathPanel'
import AccountDashboard from '../components/account/AccountDashboard'
import ControllersPanel from '../components/account/ControllersPanel'
import RecoverAccountPanel from '../components/account/RecoverAccountPanel'
import NotificationPreferencesPanel from '../components/account/NotificationPreferencesPanel'
import QuickAccessCardsPanel from '../components/account/QuickAccessCardsPanel'
import WalletDisplayPreferencesPanel from '../components/account/WalletDisplayPreferencesPanel'
import PortfolioPreferencesPanel from '../components/account/PortfolioPreferencesPanel'
import PrivacyPreferencesPanel from '../components/account/PrivacyPreferencesPanel'
import AddressBookPanel from '../components/account/AddressBookPanel'
import BackupPanel from '../components/account/BackupPanel'
import RecoveryCodesPanel from '../components/account/RecoveryCodesPanel'
import NetworkSettings from '../components/wallet/NetworkSettings'
import TaxReportsPanel from '../components/wallet/TaxReportsPanel'
import SectionIconNav from '../components/nav/SectionIconNav'
import { groupForTab } from '../config/appNav'
import PremiumPurchaseModal from '../components/ui/PremiumPurchaseModal'
import './WalletPage.css'

// My Account section panels, keyed by tab id. The section MENU now lives in the
// global nav drawer + account button (see config/appNav.js) — this page just
// hosts the panels and reads `?tab=` to pick one. WALLET_TABS is the flat list
// used for deep-link/alias resolution and for the active tab's heading label.
// (Account / Membership / Preferences are reached from the account button;
// 'custody' is surfaced to users as "Protect".)
const WALLET_TABS = [
  { id: 'account', label: 'Account' },
  { id: 'membership', label: 'Membership' },
  { id: 'network', label: 'Network' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'security', label: 'Security' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'earn', label: 'Earn' },
  { id: 'trade', label: 'Trade' },
  { id: 'paytransfer', label: 'Pay & Transfer' },
  { id: 'custody', label: 'Protect' },
  { id: 'addressbook', label: 'Address Book' },
  { id: 'backup', label: 'Backup' },
  { id: 'reports', label: 'Reporting' },
  { id: 'clearpath', label: 'ClearPath' },
  { id: 'tokens', label: 'Token Mint' },
]

// Legacy deep-link aliases → canonical tab ids (the Swap tab is now "Trade").
const TAB_ALIASES = { swap: 'trade' }

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
  const { address, isConnected, provider, signer, openConnectModal } = useWallet()
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
  // The section is driven by `?tab=` so the global nav drawer and the account
  // button can route straight to a panel (e.g. the update toast → ?tab=preferences).
  const [activeTab, setActiveTab] = useState(() => {
    const requested = searchParams.get('tab')
    const resolved = TAB_ALIASES[requested] || requested
    return WALLET_TABS.some((t) => t.id === resolved) ? resolved : 'account'
  })
  const [keyRegistered, setKeyRegistered] = useState(null)
  const [keyCheckLoading, setKeyCheckLoading] = useState(false)
  const [keyRegisterLoading, setKeyRegisterLoading] = useState(false)
  const [keyError, setKeyError] = useState(null)


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

  // Keep the active panel in sync with `?tab=` so navigating from the global
  // nav drawer / account button (which change the URL) switches sections here.
  // Always derive from the URL — a missing or unknown tab falls back to Account
  // so the panel never drifts out of sync with the address bar.
  useEffect(() => {
    const requested = searchParams.get('tab')
    const resolved = TAB_ALIASES[requested] || requested
    setActiveTab(WALLET_TABS.some((t) => t.id === resolved) ? resolved : 'account')
  }, [searchParams])

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

  // Sibling sub-items for the mobile bottom icon nav — the group the active tab
  // belongs to (Finance / Tools / Apps). Absent for account/membership/etc.
  const currentSectionGroup = groupForTab(activeTab)
  const sectionNavItems = currentSectionGroup?.items || []

  return (
    <div className="wallet-page-wrapper">
      <div className="wallet-page">

          {!isConnected ? (
            <div className="connect-section">
              <div className="connect-prompt">
                <div className="connect-icon" aria-hidden="true">{'\uD83D\uDD17'}</div>
                <h3>Connect Your Wallet</h3>
                <p>Sign in with a passkey or connect your Web3 wallet to access all features, manage your membership, and create wagers.</p>

                {/* Spec 045 FR-001: no inline connector list \u2014 every entry
                    point opens the ONE shared connect surface. */}
                <div className="connector-options">
                  <button onClick={openConnectModal} className="connector-btn">
                    Connect
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="wallet-portal wallet-portal--flat">
              {/* The wallet identity + copy-address affordance now lives on the
                  account button (top right); the section panels below no longer
                  duplicate it. */}
              <div className="wallet-portal-main">
                {/* No in-page section title — every panel renders its own
                    heading, and the section name is shown in the nav. */}
                <div className="tab-content">
                {activeTab === 'account' && (
                  <div className="profile-section" role="tabpanel">
                    <AccountDashboard />

                    {hasRole(ROLES.ADMIN) && (
                      <div className="section admin-section">
                        <h3>Administration</h3>
                        <p className="section-description">Manage roles and permissions for users</p>
                        <button onClick={handleNavigateToAdmin} className="admin-panel-btn">Role Management</button>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'portfolio' && (
                  <div className="portfolio-section" role="tabpanel">
                    <PortfolioPanel />
                  </div>
                )}

                {activeTab === 'paytransfer' && (
                  <div className="paytransfer-section" role="tabpanel">
                    <PayTransferPanel />
                  </div>
                )}

                {activeTab === 'custody' && (
                  <div className="custody-section" role="tabpanel">
                    <CustodyPanel />
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
                    {/* Spec 045 US5/US6 — account controllers & recovery.
                        ControllersPanel renders for passkey sessions (add a
                        passkey / link a wallet as recovery); the recovery
                        panel renders for wallet sessions (regain passkey
                        access using a linked wallet). Each self-gates. */}
                    <ControllersPanel />
                    <RecoverAccountPanel />
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
                    <h2 className="preferences-group-heading">Display</h2>
                    <div className="section">
                      <QuickAccessCardsPanel />
                    </div>

                    <h2 className="preferences-group-heading">Wallet</h2>
                    <div className="section">
                      <WalletDisplayPreferencesPanel address={address} />
                    </div>

                    <h2 className="preferences-group-heading">Portfolio</h2>
                    <div className="section">
                      <PortfolioPreferencesPanel />
                    </div>

                    <h2 className="preferences-group-heading">Privacy</h2>
                    <div className="section">
                      <PrivacyPreferencesPanel />
                    </div>

                    <h2 className="preferences-group-heading">Notifications</h2>
                    <div className="section">
                      <NotificationPreferencesPanel />
                    </div>

                    <h2 className="preferences-group-heading">Markets</h2>
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

                    <h2 className="preferences-group-heading">App</h2>
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
                {activeTab === 'trade' && (
                  <div className="trade-section" role="tabpanel">
                    <TradePanel />
                  </div>
                )}
                {activeTab === 'earn' && (
                  <div className="earn-section" role="tabpanel">
                    <EarnPanel />
                  </div>
                )}
                </div>

                {/* Mobile-only quick switching between the current section's
                    sibling views (Finance / Tools / Apps), pinned to the bottom. */}
                <SectionIconNav
                  items={sectionNavItems}
                  activeId={activeTab}
                  onSelect={(id) => navigate(`/wallet?tab=${id}`)}
                  ariaLabel={currentSectionGroup ? `${currentSectionGroup.label} sections` : 'Section navigation'}
                />
              </div>
            </div>
          )}
      </div>
    </div>
  )
}

export default WalletPage
