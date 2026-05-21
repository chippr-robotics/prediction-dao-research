import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet, useWalletRoles, useWalletConnection } from '../../hooks'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useModal } from '../../hooks/useUI'
import { ROLES } from '../../contexts/RoleContext'
import FriendMarketsModal from './FriendMarketsModal'
import MyMarketsModal from './MyMarketsModal'
import PolymarketBrowser from './PolymarketBrowser'
import QRScanner from '../ui/QRScanner'
import PremiumPurchaseModal from '../ui/PremiumPurchaseModal'
import { useFriendMarkets } from '../../contexts/FriendMarketsContext.js'
import './Dashboard.css'

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatAddress = (addr) => {
  if (!addr) return ''
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

// ============================================================================
// QUICK ACTION CARDS
// ============================================================================

function QuickActions({ onAction }) {
  const actions = [
    {
      id: 'create-1v1',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      title: 'New 1v1 Wager',
      description: 'Challenge a friend to a direct bet'
    },
    {
      id: 'create-group',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="23" y1="11" x2="17" y2="11" />
          <line x1="20" y1="8" x2="20" y2="14" />
        </svg>
      ),
      title: 'Group Wager',
      description: 'Create a pool for 3-10 friends'
    },
    {
      id: 'scan-qr',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      ),
      title: 'Scan QR Code',
      description: 'Accept a wager from a friend'
    },
    {
      id: 'my-wagers',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
      title: 'My Wagers',
      description: 'View active and past wagers'
    }
  ]

  return (
    <div className="quick-actions-grid">
      {actions.map(action => (
        <button
          key={action.id}
          className="quick-action-card"
          onClick={() => onAction(action.id)}
          aria-label={action.title}
        >
          <div className="quick-action-icon" aria-hidden="true">
            {action.icon}
          </div>
          <div className="quick-action-content">
            <h4>{action.title}</h4>
            <p>{action.description}</p>
          </div>
        </button>
      ))}
    </div>
  )
}

// ============================================================================
// HOW IT WORKS GUIDE
// ============================================================================

function HowItWorksGuide() {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="how-it-works-card">
      <button
        className="how-it-works-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <h3>How P2P Wagers Work</h3>
        <span className="toggle-chevron" aria-hidden="true">{isExpanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      {isExpanded && (
        <div className="how-it-works-steps">
          <div className="how-step">
            <div className="how-step-number">1</div>
            <div className="how-step-content">
              <strong>Create a wager</strong>
              <p>Pick your topic, set the stake, and choose a resolution method (either party, initiator, receiver, or third party).</p>
            </div>
          </div>
          <div className="how-step">
            <div className="how-step-number">2</div>
            <div className="how-step-content">
              <strong>Share the invite</strong>
              <p>Send the QR code or deep link to your friend. They review the terms and stake their side.</p>
            </div>
          </div>
          <div className="how-step">
            <div className="how-step-number">3</div>
            <div className="how-step-content">
              <strong>Resolution</strong>
              <p>The designated party proposes the outcome. A 24-hour challenge window ensures fairness.</p>
            </div>
          </div>
          <div className="how-step">
            <div className="how-step-number">4</div>
            <div className="how-step-content">
              <strong>Claim winnings</strong>
              <p>Winner claims the pot from the smart contract. Unclaimed funds return after 90 days.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// WELCOME VIEW (shown when wallet is not connected)
// ============================================================================

function WelcomeView({ onConnect }) {
  return (
    <div className="welcome-view">
      {/* Hero prompt */}
      <section className="welcome-hero">
        <div className="welcome-hero-badge">
          <span className="welcome-hero-badge-dot" />
          Polygon Amoy
        </div>
        <h1 className="welcome-hero-title">
          Create a wager<br />with a friend
        </h1>
        <p className="welcome-hero-subtitle">
          Connect your wallet to create trustless P2P bets. Pick a topic, set the stakes, choose a resolution method, and share the invite.
        </p>
        <button className="welcome-connect-btn" onClick={onConnect}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="6" width="20" height="14" rx="2" />
            <path d="M22 10H2" />
            <path d="M6 2v4" />
            <path d="M18 2v4" />
          </svg>
          <span>Connect Wallet</span>
        </button>
      </section>

      {/* How it works - visual steps */}
      <section className="welcome-steps">
        <h2 className="welcome-section-label">How it works</h2>
        <div className="welcome-steps-grid">
          <div className="welcome-step-card">
            <div className="welcome-step-number">1</div>
            <div className="welcome-step-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <h3>Create</h3>
            <p>Pick a topic, set the stake amount, and choose how the outcome gets decided.</p>
          </div>
          <div className="welcome-step-card">
            <div className="welcome-step-number">2</div>
            <div className="welcome-step-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </div>
            <h3>Share</h3>
            <p>Send a QR code or link to your friend. They review the terms and stake their side.</p>
          </div>
          <div className="welcome-step-card">
            <div className="welcome-step-number">3</div>
            <div className="welcome-step-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3>Settle</h3>
            <p>The result is proposed and verified through a challenge period. The winner claims the pot.</p>
          </div>
        </div>
      </section>

      {/* Resolution methods */}
      <section className="welcome-resolution">
        <h2 className="welcome-section-label">Resolution methods</h2>
        <div className="welcome-resolution-grid">
          <div className="welcome-resolution-card">
            <div className="welcome-resolution-accent welcome-resolution-accent-either" />
            <h3>Either Party</h3>
            <p>Either side can propose the outcome. 24-hour challenge period for disputes.</p>
            <span className="welcome-resolution-tag">Most flexible</span>
          </div>
          <div className="welcome-resolution-card">
            <div className="welcome-resolution-accent welcome-resolution-accent-initiator" />
            <h3>Initiator Resolves</h3>
            <p>The wager creator reports the result. The opponent can challenge.</p>
            <span className="welcome-resolution-tag">Creator decides</span>
          </div>
          <div className="welcome-resolution-card">
            <div className="welcome-resolution-accent welcome-resolution-accent-receiver" />
            <h3>Receiver Resolves</h3>
            <p>The accepting party reports the result. The creator can challenge.</p>
            <span className="welcome-resolution-tag">Opponent decides</span>
          </div>
          <div className="welcome-resolution-card">
            <div className="welcome-resolution-accent welcome-resolution-accent-thirdparty" />
            <h3>Third Party</h3>
            <p>A mutually trusted address resolves the wager. No challenge needed.</p>
            <span className="welcome-resolution-tag">Trusted arbiter</span>
          </div>
        </div>
      </section>

      {/* Example wager preview */}
      <section className="welcome-preview">
        <h2 className="welcome-section-label">What a wager looks like</h2>
        <div className="welcome-preview-card">
          <div className="welcome-preview-header">
            <span className="welcome-preview-live" />
            <span className="welcome-preview-label">Example Wager</span>
            <span className="welcome-preview-type">1v1</span>
          </div>
          <div className="welcome-preview-question">Will BTC close above $100k on March 1?</div>
          <div className="welcome-preview-stakes">
            <div className="welcome-preview-side">
              <span className="welcome-preview-side-label">You stake</span>
              <span className="welcome-preview-side-value">50 USDC</span>
            </div>
            <div className="welcome-preview-vs">VS</div>
            <div className="welcome-preview-side">
              <span className="welcome-preview-side-label">They stake</span>
              <span className="welcome-preview-side-value">50 USDC</span>
            </div>
          </div>
          <div className="welcome-preview-footer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Resolves by either party with challenge period
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="welcome-bottom-cta">
        <p>Ready to make your first wager?</p>
        <button className="welcome-connect-btn" onClick={onConnect}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="6" width="20" height="14" rx="2" />
            <path d="M22 10H2" />
            <path d="M6 2v4" />
            <path d="M18 2v4" />
          </svg>
          <span>Connect Wallet to Start</span>
        </button>
      </section>
    </div>
  )
}

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================

function Dashboard() {
  const { isConnected, account } = useWallet()
  const { connectWallet } = useWalletConnection()
  const { preferences: _preferences } = useUserPreferences()
  const { hasRole } = useWalletRoles()
  const { showModal, hideModal } = useModal()
  const navigate = useNavigate()
  // Demo mode is dev-only — set VITE_USE_MOCK_WAGERS=true in your .env to
  // bypass the wallet gate and view the dashboard with sample data. Production
  // never sets this so the badge and welcome bypass stay off.
  const demoMode = import.meta.env?.VITE_USE_MOCK_WAGERS === 'true'

  // Modal state
  const [showCreateWager, setShowCreateWager] = useState(false)
  const [createWagerType, setCreateWagerType] = useState(null) // 'oneVsOne' or 'smallGroup'
  const [showMyWagers, setShowMyWagers] = useState(false)
  const [showQrScanner, setShowQrScanner] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  // Pre-fill payload for the create-wager modal when launched from a
  // Polymarket card. Cleared on modal close so subsequent opens start clean.
  const [initialPolymarketMarket, setInitialPolymarketMarket] = useState(null)

  // Friend markets from shared context (single fetch, no duplication)
  const { friendMarkets } = useFriendMarkets()

  // Split friend markets into active/past for the My Wagers modal
  const { activeFriendMarkets, pastFriendMarkets } = useMemo(() => {
    const now = new Date()
    const userAddr = account?.toLowerCase()

    const userMarkets = friendMarkets.filter(m =>
      m.creator?.toLowerCase() === userAddr ||
      m.participants?.some(p => p.toLowerCase() === userAddr)
    )

    const isPastMarket = (m) => {
      const endDate = new Date(m.endDate)
      const status = m.status?.toLowerCase()
      return endDate <= now ||
             status === 'resolved' ||
             status === 'cancelled' ||
             status === 'canceled' ||
             status === 'refunded' ||
             status === 'oracle_timed_out'
    }

    return {
      activeFriendMarkets: userMarkets.filter(m => !isPastMarket(m)),
      pastFriendMarkets: userMarkets.filter(m => isPastMarket(m))
    }
  }, [friendMarkets, account])

  const handleQuickAction = useCallback((actionId) => {
    switch (actionId) {
      case 'create-1v1':
        setCreateWagerType('oneVsOne')
        setShowCreateWager(true)
        break
      case 'create-group':
        setCreateWagerType('smallGroup')
        setShowCreateWager(true)
        break
      case 'my-wagers':
        setShowMyWagers(true)
        break
      case 'scan-qr':
        setShowQrScanner(true)
        break
      default:
        break
    }
  }, [])

  const handlePolymarketCardClick = useCallback((market) => {
    setInitialPolymarketMarket(market)
    setCreateWagerType('oneVsOne')
    setShowCreateWager(true)
  }, [])

  const handleQrScanSuccess = useCallback((decodedText) => {
    setShowQrScanner(false)

    // Try to extract a market ID or navigate to the scanned URL
    try {
      const url = new URL(decodedText)
      const trustedOrigins = [window.location.origin]
      const isFromTrustedSource = trustedOrigins.some(origin => url.origin === origin)

      if (isFromTrustedSource) {
        // Navigate to the path from the trusted URL
        navigate(url.pathname + url.search)
      } else {
        // Extract market ID from path (e.g., /market/123 or /friend-market/preview?id=123)
        const marketIdMatch = url.pathname.match(/\/market\/(\d+)/)
        const idParam = url.searchParams.get('id')

        if (marketIdMatch) {
          navigate(`/market/${marketIdMatch[1]}`)
        } else if (idParam) {
          navigate(`/market/${idParam}`)
        } else {
          // For external URLs, confirm before navigating
          const proceed = window.confirm(
            'This QR code contains a URL from an external source. Open it?'
          )
          if (proceed) {
            window.open(decodedText, '_blank', 'noopener,noreferrer')
          }
        }
      }
    } catch {
      // Not a URL — check if it's a raw market ID (numeric)
      if (/^\d+$/.test(decodedText.trim())) {
        navigate(`/market/${decodedText.trim()}`)
      }
    }
  }, [navigate])

  // Not connected state — show welcome/onboarding view
  if (!isConnected && !demoMode) {
    return (
      <div className="dashboard-container">
        <WelcomeView onConnect={() => connectWallet()} />
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <div className="header-title-row">
            <h1>Your Wagers</h1>
            {demoMode && <span className="demo-mode-badge">Demo Mode</span>}
          </div>
          <p className="dashboard-subtitle">
            {isConnected
              ? `Connected: ${formatAddress(account)}`
              : 'Viewing sample data - connect your wallet to create wagers'}
          </p>
        </div>
      </header>

      {/* Membership CTA Banner */}
      {isConnected && !bannerDismissed && !hasRole(ROLES.FRIEND_MARKET) && (
        <div className="dashboard-cta-banner">
          <div className="cta-banner-content">
            <strong>Get access to create and accept wagers</strong>
            <p>Purchase a membership to start creating P2P wagers with friends.</p>
          </div>
          <div className="cta-banner-actions">
            <button
              className="cta-banner-btn primary"
              onClick={() => showModal(<PremiumPurchaseModal onClose={hideModal} />, { title: '', size: 'large', closable: false })}
            >
              Get Membership
            </button>
            <button className="cta-banner-dismiss" onClick={() => setBannerDismissed(true)} aria-label="Dismiss">&times;</button>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <section className="dashboard-section">
        <QuickActions onAction={handleQuickAction} />
      </section>

      {/* Top Polymarket markets — self-gates on chain capability, renders
          nothing on chains without Polymarket support. */}
      <section className="dashboard-section">
        <PolymarketBrowser
          variant="feed"
          onSelectMarket={handlePolymarketCardClick}
        />
      </section>

      {/* How It Works (collapsible) */}
      <section className="dashboard-section">
        <HowItWorksGuide />
      </section>

      {/* Create Wager Modal */}
      <FriendMarketsModal
        isOpen={showCreateWager}
        onClose={() => {
          setShowCreateWager(false)
          setCreateWagerType(null)
          setInitialPolymarketMarket(null)
        }}
        initialTab="create"
        initialType={createWagerType}
        initialPolymarketMarket={initialPolymarketMarket}
        activeMarkets={activeFriendMarkets}
        pastMarkets={pastFriendMarkets}
      />

      {/* My Wagers Modal */}
      <MyMarketsModal
        isOpen={showMyWagers}
        onClose={() => setShowMyWagers(false)}
        friendMarkets={friendMarkets}
      />

      {/* QR Scanner Modal */}
      <QRScanner
        isOpen={showQrScanner}
        onClose={() => setShowQrScanner(false)}
        onScanSuccess={handleQrScanSuccess}
      />
    </div>
  )
}

export default Dashboard
