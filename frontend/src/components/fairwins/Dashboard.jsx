import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../../hooks'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { WAGER_DEFAULTS, WagerStatus, ORACLE_SOURCES } from '../../constants/wagerDefaults'
import FriendMarketsModal from './FriendMarketsModal'
import MyMarketsModal from './MyMarketsModal'
import QRScanner from '../ui/QRScanner'
import { fetchFriendMarketsForUser } from '../../utils/blockchainService'
import './Dashboard.css'

// ============================================================================
// DEMO DATA CONSTANTS (computed once at module load, not during render)
// ============================================================================

const DEMO_END_30D = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
const DEMO_END_14D = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
const DEMO_END_45D = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString()
const DEMO_END_PAST = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatAddress = (addr) => {
  if (!addr) return ''
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

const getTimeRemaining = (endTime) => {
  const now = new Date()
  const end = new Date(endTime)
  const diff = end - now
  if (diff <= 0) return 'Ended'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `${days}d ${hours}h`
  return `${hours}h`
}

// ============================================================================
// STATUS BADGE COMPONENT
// ============================================================================

function StatusBadge({ status }) {
  const statusConfig = {
    [WagerStatus.PENDING_ACCEPTANCE]: { label: 'Pending', className: 'status-pending' },
    [WagerStatus.ACTIVE]: { label: 'Active', className: 'status-active' },
    [WagerStatus.PENDING_RESOLUTION]: { label: 'Resolving', className: 'status-resolving' },
    [WagerStatus.DISPUTED]: { label: 'Disputed', className: 'status-disputed' },
    [WagerStatus.RESOLVED]: { label: 'Resolved', className: 'status-resolved' },
    [WagerStatus.EXPIRED]: { label: 'Expired', className: 'status-expired' },
    [WagerStatus.CANCELLED]: { label: 'Cancelled', className: 'status-expired' }
  }

  const config = statusConfig[status] || { label: status, className: '' }

  return (
    <span className={`wager-status-badge ${config.className}`}>
      {config.label}
    </span>
  )
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
// WAGER CARD COMPONENT
// ============================================================================

function WagerCard({ wager, onClick }) {
  return (
    <div
      className="wager-card"
      onClick={() => onClick?.(wager)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.(wager)}
    >
      <div className="wager-card-header">
        <StatusBadge status={wager.status} />
        <span className="wager-time">{getTimeRemaining(wager.endTime)}</span>
      </div>
      <h4 className="wager-card-title">{wager.description}</h4>
      <div className="wager-card-details">
        <div className="wager-detail">
          <span className="wager-detail-label">Stake</span>
          <span className="wager-detail-value">{wager.stakeAmount} {wager.stakeToken}</span>
        </div>
        <div className="wager-detail">
          <span className="wager-detail-label">Type</span>
          <span className="wager-detail-value">{wager.type}</span>
        </div>
        <div className="wager-detail">
          <span className="wager-detail-label">Oracle</span>
          <span className="wager-detail-value">{wager.oracle}</span>
        </div>
      </div>
      <div className="wager-card-participants">
        {wager.participants.map((p, i) => (
          <span key={i} className="participant-badge" title={p}>
            {formatAddress(p)}
          </span>
        ))}
      </div>
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
              <p>Pick your topic, set the stake, and choose an oracle for resolution (Polymarket, Chainlink, UMA, or manual).</p>
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
              <strong>Auto-resolution</strong>
              <p>The oracle resolves the outcome. Manual resolutions include a 24-hour challenge window.</p>
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
// ORACLE INFO PANEL (used in connected dashboard view)
// ============================================================================

function OracleInfoPanel({ isConnected }) {
  const status = isConnected ? 'available' : 'offline'

  return (
    <div className="oracle-info-panel">
      <h3>Oracle Sources</h3>
      <div className="oracle-list">
        {ORACLE_SOURCES.map(oracle => (
          <div key={oracle.name} className="oracle-item">
            <span className="oracle-icon" aria-hidden="true">{oracle.icon}</span>
            <div className="oracle-content">
              <span className="oracle-name">{oracle.name}</span>
              <span className="oracle-description">{oracle.description}</span>
            </div>
            <span className={`oracle-status ${status}`}>
              {isConnected ? 'Available' : 'Not Connected'}
            </span>
          </div>
        ))}
      </div>
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
          Ethereum Classic
        </div>
        <h1 className="welcome-hero-title">
          Create a wager<br />with a friend
        </h1>
        <p className="welcome-hero-subtitle">
          Connect your wallet to create trustless P2P bets. Pick a topic, set the stakes, choose an oracle, and share the invite.
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
            <p>The oracle resolves the result. The winner claims the pot from the smart contract.</p>
          </div>
        </div>
      </section>

      {/* Oracle options - informational, not status */}
      <section className="welcome-oracles">
        <h2 className="welcome-section-label">Pick your truth source</h2>
        <div className="welcome-oracle-grid">
          <div className="welcome-oracle-card">
            <div className="welcome-oracle-accent welcome-oracle-accent-polymarket" />
            <h3>Polymarket</h3>
            <p>Peg your wager to any Polymarket event. Elections, sports, world events.</p>
            <span className="welcome-oracle-tag">Events &amp; outcomes</span>
          </div>
          <div className="welcome-oracle-card">
            <div className="welcome-oracle-accent welcome-oracle-accent-chainlink" />
            <h3>Chainlink</h3>
            <p>Decentralized price feeds for crypto, forex, and commodities.</p>
            <span className="welcome-oracle-tag">Price predictions</span>
          </div>
          <div className="welcome-oracle-card">
            <div className="welcome-oracle-accent welcome-oracle-accent-uma" />
            <h3>UMA Optimistic</h3>
            <p>Assert any claim and let UMA's dispute mechanism ensure honest resolution.</p>
            <span className="welcome-oracle-tag">Custom claims</span>
          </div>
          <div className="welcome-oracle-card">
            <div className="welcome-oracle-accent welcome-oracle-accent-manual" />
            <h3>Manual + Challenge</h3>
            <p>Creator resolves it. The other side gets 24 hours to dispute.</p>
            <span className="welcome-oracle-tag">Casual bets</span>
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
              <span className="welcome-preview-side-value">0.5 ETC</span>
            </div>
            <div className="welcome-preview-vs">VS</div>
            <div className="welcome-preview-side">
              <span className="welcome-preview-side-label">They stake</span>
              <span className="welcome-preview-side-value">0.5 ETC</span>
            </div>
          </div>
          <div className="welcome-preview-footer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Resolves via Chainlink Price Feed
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

function Dashboard({ onConnect }) {
  const { isConnected, account } = useWallet()
  const { preferences } = useUserPreferences()
  const navigate = useNavigate()
  const demoMode = preferences?.demoMode ?? true

  // Modal state
  const [showCreateWager, setShowCreateWager] = useState(false)
  const [createWagerType, setCreateWagerType] = useState(null) // 'oneVsOne' or 'smallGroup'
  const [showMyWagers, setShowMyWagers] = useState(false)
  const [showQrScanner, setShowQrScanner] = useState(false)

  // Friend markets state (live blockchain data)
  const [friendMarkets, setFriendMarkets] = useState([])
  const [wagersLoading, setWagersLoading] = useState(false)

  // Fetch friend markets from blockchain when connected and in live mode
  useEffect(() => {
    if (!account || !isConnected || demoMode) return

    let cancelled = false

    const fetchMarkets = async (attempt = 0) => {
      setWagersLoading(true)
      try {
        const markets = await fetchFriendMarketsForUser(account)
        if (!cancelled) {
          setFriendMarkets(markets)
          setWagersLoading(false)
        }
      } catch (error) {
        console.error('[Dashboard] Error fetching friend markets:', error)
        if (!cancelled && attempt < 2) {
          const delay = (attempt + 1) * 2000
          setTimeout(() => fetchMarkets(attempt + 1), delay)
        } else if (!cancelled) {
          setWagersLoading(false)
        }
      }
    }

    fetchMarkets()
    return () => { cancelled = true }
  }, [account, isConnected, demoMode])

  // Transform friend markets into wager card format for live mode display
  const liveWagers = useMemo(() => {
    if (demoMode) return []
    return friendMarkets.map(m => ({
      id: m.id,
      description: m.description,
      status: m.status === 'pending' ? WagerStatus.PENDING_ACCEPTANCE : m.status,
      stakeAmount: m.stakeAmount,
      stakeToken: m.stakeTokenSymbol || 'ETC',
      type: m.type === 'oneVsOne' ? '1v1' : m.type === 'smallGroup' ? 'Group' : m.type,
      oracle: m.arbitrator ? 'Third Party' : 'Manual',
      endTime: m.endDate,
      participants: m.participants || []
    }))
  }, [friendMarkets, demoMode])

  // Split friend markets into active/past for modals
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
             status === 'canceled'
    }

    return {
      activeFriendMarkets: userMarkets.filter(m => !isPastMarket(m)),
      pastFriendMarkets: userMarkets.filter(m => isPastMarket(m))
    }
  }, [friendMarkets, account])

  // Mock wager data for demo mode
  const mockWagers = useMemo(() => {
    if (!demoMode) return []
    return [
      {
        id: 1,
        description: 'Will BTC be above $100k by March 2026?',
        status: WagerStatus.ACTIVE,
        stakeAmount: '50',
        stakeToken: WAGER_DEFAULTS.STAKE_TOKEN_ID,
        type: '1v1',
        oracle: 'Chainlink',
        endTime: DEMO_END_30D,
        participants: ['0x1a2b3c4d5e6f7890abcdef1234567890abcdef12', '0xabcdef1234567890abcdef1234567890abcdef12']
      },
      {
        id: 2,
        description: 'Super Bowl LX winner - Chiefs or 49ers?',
        status: WagerStatus.PENDING_ACCEPTANCE,
        stakeAmount: '25',
        stakeToken: WAGER_DEFAULTS.STAKE_TOKEN_ID,
        type: '1v1',
        oracle: 'Polymarket',
        endTime: DEMO_END_14D,
        participants: ['0x1a2b3c4d5e6f7890abcdef1234567890abcdef12']
      },
      {
        id: 3,
        description: 'Will it snow in Austin before April?',
        status: WagerStatus.ACTIVE,
        stakeAmount: WAGER_DEFAULTS.STAKE_AMOUNT,
        stakeToken: WAGER_DEFAULTS.STAKE_TOKEN_ID,
        type: 'Group',
        oracle: 'Manual',
        endTime: DEMO_END_45D,
        participants: ['0x1a2b3c4d5e6f7890abcdef1234567890abcdef12', '0xabcdef1234567890abcdef1234567890abcdef12', '0x9876543210fedcba9876543210fedcba98765432']
      },
      {
        id: 4,
        description: 'ETH merge anniversary price prediction',
        status: WagerStatus.RESOLVED,
        stakeAmount: '100',
        stakeToken: WAGER_DEFAULTS.STAKE_TOKEN_ID,
        type: '1v1',
        oracle: 'Chainlink',
        endTime: DEMO_END_PAST,
        participants: ['0x1a2b3c4d5e6f7890abcdef1234567890abcdef12', '0xfedcba0987654321fedcba0987654321fedcba09']
      }
    ]
  }, [demoMode])

  const activeWagers = useMemo(() => {
    const wagers = demoMode ? mockWagers : liveWagers
    return wagers.filter(w => w.status === WagerStatus.ACTIVE || w.status === WagerStatus.PENDING_ACCEPTANCE)
  }, [demoMode, mockWagers, liveWagers])

  const pastWagers = useMemo(() => {
    const wagers = demoMode ? mockWagers : liveWagers
    return wagers.filter(w => w.status === WagerStatus.RESOLVED || w.status === WagerStatus.EXPIRED || w.status === WagerStatus.CANCELLED)
  }, [demoMode, mockWagers, liveWagers])

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

  const handleWagerClick = useCallback(() => {
    setShowMyWagers(true)
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
        <WelcomeView onConnect={onConnect} />
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

      {/* Quick Actions */}
      <section className="dashboard-section">
        <QuickActions onAction={handleQuickAction} />
      </section>

      {/* How It Works (collapsible) */}
      <section className="dashboard-section">
        <HowItWorksGuide />
      </section>

      {/* Active Wagers */}
      <section className="dashboard-section">
        <div className="section-header">
          <h3>Active Wagers</h3>
          <span className="section-count">{activeWagers.length}</span>
        </div>
        {wagersLoading && !demoMode ? (
          <div className="empty-state compact">
            <p>Loading wagers...</p>
          </div>
        ) : activeWagers.length > 0 ? (
          <div className="wagers-grid">
            {activeWagers.map(wager => (
              <WagerCard key={wager.id} wager={wager} onClick={handleWagerClick} />
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            <p>No active wagers yet. Create one to get started.</p>
          </div>
        )}
      </section>

      {/* Past Wagers */}
      {pastWagers.length > 0 && (
        <section className="dashboard-section">
          <div className="section-header">
            <h3>Past Wagers</h3>
            <span className="section-count">{pastWagers.length}</span>
          </div>
          <div className="wagers-grid">
            {pastWagers.map(wager => (
              <WagerCard key={wager.id} wager={wager} onClick={handleWagerClick} />
            ))}
          </div>
        </section>
      )}

      {/* Oracle Info */}
      <section className="dashboard-section">
        <OracleInfoPanel isConnected={isConnected} />
      </section>

      {/* Create Wager Modal */}
      <FriendMarketsModal
        isOpen={showCreateWager}
        onClose={() => {
          setShowCreateWager(false)
          setCreateWagerType(null)
        }}
        initialTab="create"
        initialType={createWagerType}
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
