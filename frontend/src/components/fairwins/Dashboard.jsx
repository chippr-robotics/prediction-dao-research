import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useWallet, useWalletRoles, useWalletConnection } from '../../hooks'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useModal } from '../../hooks/useUI'
import { useWagerActivityOptional } from '../../hooks/useWagerActivity'
import { ROLES } from '../../contexts/RoleContext'
import { SHOW_ALL_ORACLE_MODELS } from '../../constants/wagerDefaults'
import FriendMarketsModal from './FriendMarketsModal'
import OpenChallengeModal from './OpenChallengeModal'
import { parseTakeChallengeParams } from '../../utils/claimCode/deepLink.js'
import MyMarketsModal from './MyMarketsModal'
import PolymarketBrowser from './PolymarketBrowser'
import QRScanner from '../ui/QRScanner'
import AddressQRModal from '../ui/AddressQRModal'
import PremiumPurchaseModal from '../ui/PremiumPurchaseModal'
import Badge from '../ui/Badge'
import { useFriendMarkets } from '../../contexts/FriendMarketsContext.js'
import { NETWORK_CONFIG } from '../../config/contracts'
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

// Trailing affordance arrow, shared by every card. Sits in the right column
// and slides/brightens on hover so the whole tile reads as actionable.
const QA_ARROW = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
)

function QuickActionCard({ action, onAction }) {
  // Every card uses the single site-green brand accent (set on
  // .quick-action-card in CSS). Tiles are differentiated by icon, tag, and
  // label — not color. The `qa-{category}` class only drives the subtle
  // primary-group emphasis on the creation tiles.
  return (
    <button
      className={`quick-action-card qa-${action.category}`}
      onClick={() => onAction(action.id)}
      aria-label={action.ariaLabel || action.title}
    >
      <span className="qa-rail" aria-hidden="true" />
      <span className="quick-action-icon" aria-hidden="true">
        {action.icon}
      </span>
      <span className="quick-action-content">
        {action.tag && <span className="qa-tag">{action.tag}</span>}
        <h4>{action.title}</h4>
        <p>{action.description}</p>
      </span>
      <span className="qa-arrow" aria-hidden="true">{QA_ARROW}</span>
      {action.badge && (
        <Badge variant="warning" className="quick-action-badge">
          <span aria-hidden="true">{action.badge.count}</span>
          <span className="sr-only">{action.badge.label}</span>
        </Badge>
      )}
    </button>
  )
}

function QuickActions({ onAction, actionNeededCount = 0 }) {
  // Spec 012 FR-007: the My Wagers entry point surfaces the watcher's
  // action-needed count. The full sentence goes into the button's aria-label
  // (an aria-label suppresses descendant text for the accessible name) and is
  // duplicated as an sr-only span inside the visible badge.
  const actionNeededText =
    `${actionNeededCount} wager${actionNeededCount === 1 ? '' : 's'} ` +
    `need${actionNeededCount === 1 ? 's' : ''} action`

  // The six actions split into two intents the user actually has: starting a
  // wager (three settlement styles) vs. tracking/handing one off. Grouping +
  // labels/tags/icons make that split legible — all tiles share the site-green
  // brand accent (no per-tile colors).
  const createActions = [
    {
      id: 'create-1v1-friends',
      category: 'create',
      tag: 'People settle',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      title: 'Friends Decide (1v1)',
      description: 'You and a friend settle the outcome'
    },
    {
      id: 'create-1v1-oracle',
      category: 'create',
      tag: 'Oracle settles',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
      title: 'Oracle Settles (1v1)',
      description: SHOW_ALL_ORACLE_MODELS
        ? 'Auto-settles from Polymarket, Chainlink or UMA'
        : 'Auto-settles from a linked Polymarket market'
    },
    {
      id: 'create-offer',
      category: 'create',
      tag: 'Set the odds',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      title: 'Make an Offer',
      description: 'Offer odds and choose who settles — you or your friend'
    },
    {
      id: 'open-challenge',
      category: 'create',
      tag: 'Code-gated',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 9.9-1" />
          <circle cx="12" cy="16" r="1" />
        </svg>
      ),
      title: 'Open Challenge',
      description: 'Post without naming an opponent — share a four-word code to create or take'
    }
  ]

  const utilityActions = [
    {
      id: 'my-wagers',
      category: 'track',
      tag: 'Track',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
      title: 'My Wagers',
      description: 'View active and past wagers',
      ariaLabel: actionNeededCount > 0
        ? `My Wagers — ${actionNeededText}`
        : undefined,
      badge: actionNeededCount > 0
        ? { count: actionNeededCount, label: actionNeededText }
        : null
    },
    {
      id: 'scan-qr',
      category: 'qr',
      tag: 'Scan',
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
      id: 'share-account',
      category: 'qr',
      tag: 'Share',
      // QR grid with an outward arrow — keeps the QR vocabulary of the
      // adjacent Scan card while staying visually distinct from it.
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <line x1="17.5" y1="21" x2="17.5" y2="15" />
          <polyline points="14.5 17.5 17.5 14.5 20.5 17.5" />
        </svg>
      ),
      title: 'Share Account',
      // The visible title alone is ambiguous for screen readers ("Account"
      // could mean the My Account page), so the accessible name spells out
      // the QR outcome (spec 011 W1 naming convention).
      ariaLabel: 'Share Account — show your address as a QR code',
      description: 'Show your address as a QR code'
    }
  ]

  return (
    <div className="quick-actions-grid">
      <div className="qa-group-header" role="presentation">
        <span className="qa-group-eyebrow">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Start a wager
        </span>
        <span className="qa-group-sub">Pick who settles the outcome</span>
      </div>
      {createActions.map(action => (
        <QuickActionCard key={action.id} action={action} onAction={onAction} />
      ))}

      <div className="qa-group-header qa-group-header--track" role="presentation">
        <span className="qa-group-eyebrow">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Track &amp; share
        </span>
        <span className="qa-group-sub">Your wagers and in-person handoffs</span>
      </div>
      {utilityActions.map(action => (
        <QuickActionCard key={action.id} action={action} onAction={onAction} />
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
          {NETWORK_CONFIG.name}
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
  const location = useLocation()
  // Wager activity watcher (spec 012). Optional: the dashboard must keep
  // working when rendered outside WagerActivityProvider (legacy tests).
  const activity = useWagerActivityOptional()
  const actionNeededCount = activity?.actionNeededCount ?? 0
  // Demo mode is dev-only — set VITE_USE_MOCK_WAGERS=true in your .env to
  // bypass the wallet gate and view the dashboard with sample data. Production
  // never sets this so the badge and welcome bypass stay off.
  const demoMode = import.meta.env?.VITE_USE_MOCK_WAGERS === 'true'

  // Modal state
  const [showCreateWager, setShowCreateWager] = useState(false)
  const [showOpenChallenge, setShowOpenChallenge] = useState(false)
  const [openChallengeTab, setOpenChallengeTab] = useState('maker')
  const [openChallengeInitialCode, setOpenChallengeInitialCode] = useState('')
  const [createWagerType, setCreateWagerType] = useState(null) // 'oneVsOne' or 'offer'
  // Narrows the modal's resolution choices: 'participant' (people settle),
  // 'oracle' (oracle settles), or 'all' (both — used by the Make an Offer card).
  const [createResolutionCategory, setCreateResolutionCategory] = useState('all')
  const [showMyWagers, setShowMyWagers] = useState(false)
  const [showQrScanner, setShowQrScanner] = useState(false)
  const [showAddressQR, setShowAddressQR] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  // Pre-fill payload for the create-wager modal when launched from a
  // Polymarket card. Cleared on modal close so subsequent opens start clean.
  const [initialPolymarketMarket, setInitialPolymarketMarket] = useState(null)
  // Wager id the My Wagers modal should open directly on (feed navigation).
  const [initialWagerId, setInitialWagerId] = useState(null)

  // Friend markets from shared context (single fetch, no duplication)
  const { friendMarkets } = useFriendMarkets()

  // Feed → wager navigation (spec 012 T018/FR-004). The activity feed
  // navigates to /app with { openWagerId } in router state. Stash the id and
  // open My Wagers during render (React's "adjust state while rendering"
  // pattern — guarded, so it settles after one extra render), then consume
  // the router state in an effect so a refresh or back-navigation doesn't
  // re-open the modal.
  const routeWagerId = location.state?.openWagerId == null
    ? null
    : String(location.state.openWagerId)
  if (routeWagerId != null && initialWagerId !== routeWagerId) {
    setInitialWagerId(routeWagerId)
    setShowMyWagers(true)
  }
  useEffect(() => {
    if (routeWagerId == null) return
    navigate(location.pathname, { replace: true, state: {} })
  }, [routeWagerId, location.pathname, navigate])

  // Open-challenge deep link (feature 024): a shared QR / link of the form
  // /app?oc=take&code=<four words> opens the Open Challenge modal on the Taker tab with the code pre-filled.
  // After consuming it we strip the query so it doesn't re-trigger on re-render or get bookmarked with the code.
  useEffect(() => {
    const code = parseTakeChallengeParams(location.search)
    if (code) {
      setOpenChallengeInitialCode(code)
      setOpenChallengeTab('taker')
      setShowOpenChallenge(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.search, location.pathname, navigate])

  const handleQuickAction = useCallback((actionId) => {
    switch (actionId) {
      case 'create-1v1-friends':
        setCreateWagerType('oneVsOne')
        setCreateResolutionCategory('participant')
        setShowCreateWager(true)
        break
      case 'create-1v1-oracle':
        setCreateWagerType('oneVsOne')
        setCreateResolutionCategory('oracle')
        setShowCreateWager(true)
        break
      case 'create-offer':
        setCreateWagerType('offer')
        setCreateResolutionCategory('all')
        setShowCreateWager(true)
        break
      case 'open-challenge':
        setOpenChallengeTab('maker')
        setShowOpenChallenge(true)
        break
      case 'my-wagers':
        setShowMyWagers(true)
        break
      case 'scan-qr':
        setShowQrScanner(true)
        break
      case 'share-account':
        setShowAddressQR(true)
        break
      default:
        break
    }
  }, [])

  const handlePolymarketCardClick = useCallback((market) => {
    setInitialPolymarketMarket(market)
    setCreateWagerType('oneVsOne')
    // A Polymarket card pre-selects an oracle (Polymarket) condition, so open
    // straight into the oracle-resolved flow.
    setCreateResolutionCategory('oracle')
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
      {isConnected && !bannerDismissed && !hasRole(ROLES.WAGER_PARTICIPANT) && (
        <div className="dashboard-cta-banner">
          <div className="cta-banner-content">
            <strong>Get access to create and accept peer-to-peer wagers</strong>
            <p>Purchase the Wager Participant role to start creating P2P wagers.</p>
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
        <QuickActions onAction={handleQuickAction} actionNeededCount={actionNeededCount} />
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
          setCreateResolutionCategory('all')
          setInitialPolymarketMarket(null)
        }}
        initialType={createWagerType}
        resolutionCategory={createResolutionCategory}
        initialPolymarketMarket={initialPolymarketMarket}
      />

      {/* Open Challenge (feature 024) — one modal, Maker/Taker tabs. key remounts for fresh state per open. */}
      <OpenChallengeModal
        key={showOpenChallenge ? 'oc-open' : 'oc-closed'}
        isOpen={showOpenChallenge}
        initialTab={openChallengeTab}
        initialCode={openChallengeInitialCode}
        onClose={() => setShowOpenChallenge(false)}
        onBuyMembership={() => {
          setShowOpenChallenge(false)
          showModal(<PremiumPurchaseModal onClose={hideModal} />, { title: '', size: 'large', closable: false })
        }}
      />

      {/* My Wagers Modal */}
      <MyMarketsModal
        isOpen={showMyWagers}
        onClose={() => {
          setShowMyWagers(false)
          setInitialWagerId(null)
        }}
        friendMarkets={friendMarkets}
        initialSelectedMarketId={initialWagerId}
      />

      {/* QR Scanner Modal */}
      <QRScanner
        isOpen={showQrScanner}
        onClose={() => setShowQrScanner(false)}
        onScanSuccess={handleQrScanSuccess}
      />

      {/* Address QR Modal (spec 011) — quick variant: clean QR using the
          persisted Account-page color, no color options, no visible address.
          Mounted per open so the preference is re-read each time. */}
      {showAddressQR && (
        <AddressQRModal
          isOpen
          onClose={() => setShowAddressQR(false)}
          address={account}
          variant="quick"
        />
      )}
    </div>
  )
}

export default Dashboard
