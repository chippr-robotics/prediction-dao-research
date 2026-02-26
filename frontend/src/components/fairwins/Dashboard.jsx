import { useState, useMemo, useCallback } from 'react'
import { useWallet } from '../../hooks'
import { useUserPreferences } from '../../hooks/useUserPreferences'
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
    pending_acceptance: { label: 'Pending', className: 'status-pending' },
    active: { label: 'Active', className: 'status-active' },
    pending_resolution: { label: 'Resolving', className: 'status-resolving' },
    disputed: { label: 'Disputed', className: 'status-disputed' },
    resolved: { label: 'Resolved', className: 'status-resolved' },
    expired: { label: 'Expired', className: 'status-expired' },
    cancelled: { label: 'Cancelled', className: 'status-expired' }
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
// ORACLE INFO PANEL
// ============================================================================

function OracleInfoPanel() {
  const oracles = [
    { name: 'Polymarket', description: 'Peg wagers to Polymarket event outcomes', status: 'available', icon: '\uD83C\uDFAF' },
    { name: 'Chainlink', description: 'Price feed-based resolution', status: 'available', icon: '\uD83D\uDD17' },
    { name: 'UMA', description: 'Custom truth assertions', status: 'available', icon: '\u2696\uFE0F' },
    { name: 'Manual', description: 'Creator-resolved with challenge period', status: 'available', icon: '\u270B' }
  ]

  return (
    <div className="oracle-info-panel">
      <h3>Oracle Sources</h3>
      <div className="oracle-list">
        {oracles.map(oracle => (
          <div key={oracle.name} className="oracle-item">
            <span className="oracle-icon" aria-hidden="true">{oracle.icon}</span>
            <div className="oracle-content">
              <span className="oracle-name">{oracle.name}</span>
              <span className="oracle-description">{oracle.description}</span>
            </div>
            <span className={`oracle-status ${oracle.status}`}>
              {oracle.status === 'available' ? 'Available' : 'Offline'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================

function Dashboard() {
  const { isConnected, account } = useWallet()
  const { preferences } = useUserPreferences()
  const demoMode = preferences?.demoMode ?? true

  // Mock wager data for demo mode
  const mockWagers = useMemo(() => {
    if (!demoMode) return []
    return [
      {
        id: 1,
        description: 'Will BTC be above $100k by March 2026?',
        status: 'active',
        stakeAmount: '50',
        stakeToken: 'USC',
        type: '1v1',
        oracle: 'Chainlink',
        endTime: DEMO_END_30D,
        participants: ['0x1a2b3c4d5e6f7890abcdef1234567890abcdef12', '0xabcdef1234567890abcdef1234567890abcdef12']
      },
      {
        id: 2,
        description: 'Super Bowl LX winner - Chiefs or 49ers?',
        status: 'pending_acceptance',
        stakeAmount: '25',
        stakeToken: 'USC',
        type: '1v1',
        oracle: 'Polymarket',
        endTime: DEMO_END_14D,
        participants: ['0x1a2b3c4d5e6f7890abcdef1234567890abcdef12']
      },
      {
        id: 3,
        description: 'Will it snow in Austin before April?',
        status: 'active',
        stakeAmount: '10',
        stakeToken: 'USC',
        type: 'Group',
        oracle: 'Manual',
        endTime: DEMO_END_45D,
        participants: ['0x1a2b3c4d5e6f7890abcdef1234567890abcdef12', '0xabcdef1234567890abcdef1234567890abcdef12', '0x9876543210fedcba9876543210fedcba98765432']
      },
      {
        id: 4,
        description: 'ETH merge anniversary price prediction',
        status: 'resolved',
        stakeAmount: '100',
        stakeToken: 'USC',
        type: '1v1',
        oracle: 'Chainlink',
        endTime: DEMO_END_PAST,
        participants: ['0x1a2b3c4d5e6f7890abcdef1234567890abcdef12', '0xfedcba0987654321fedcba0987654321fedcba09']
      }
    ]
  }, [demoMode])

  const activeWagers = useMemo(() =>
    mockWagers.filter(w => w.status === 'active' || w.status === 'pending_acceptance'),
    [mockWagers]
  )

  const pastWagers = useMemo(() =>
    mockWagers.filter(w => w.status === 'resolved' || w.status === 'expired' || w.status === 'cancelled'),
    [mockWagers]
  )

  const handleQuickAction = useCallback((actionId) => {
    console.log('Quick action:', actionId)
  }, [])

  const handleWagerClick = useCallback((wager) => {
    console.log('Navigate to wager:', wager.id)
  }, [])

  // Not connected state
  if (!isConnected && !demoMode) {
    return (
      <div className="dashboard-container">
        <header className="dashboard-header">
          <div className="header-content">
            <div className="header-title-row">
              <h1>P2P Wagers</h1>
            </div>
            <p className="dashboard-subtitle">Connect your wallet to create and manage wagers</p>
          </div>
        </header>
        <section className="dashboard-section">
          <HowItWorksGuide />
        </section>
        <section className="dashboard-section">
          <OracleInfoPanel />
        </section>
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
        {activeWagers.length > 0 ? (
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
        <OracleInfoPanel />
      </section>
    </div>
  )
}

export default Dashboard
