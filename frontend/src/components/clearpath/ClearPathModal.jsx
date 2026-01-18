import { useState, useEffect, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import { ethers } from 'ethers'
import { useEthers, useAccount } from '../../hooks/useWeb3'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { getContractAddress } from '../../config/contracts'
import './ClearPathModal.css'

/**
 * ClearPathModal Component
 *
 * Modern modal for ClearPath governance features following the
 * FriendMarketsModal design pattern with tabbed navigation.
 *
 * Features:
 * - My DAOs: View and manage your DAOs
 * - Browse: Discover and join new DAOs
 * - Proposals: View active governance proposals
 * - Submit: Create new proposals
 * - Metrics: Welfare metrics dashboard
 * - Launch: Create new DAOs
 * 
 * @param {Object} props - Component props
 * @param {boolean} [props.isOpen=true] - Whether the modal is open (defaults to true)
 * @param {() => void} [props.onClose=() => {}] - Function to call when modal should close (defaults to no-op)
 * @param {string} [props.defaultTab='daos'] - Default tab to show when modal opens
 */

const DAOFactoryABI = [
  "function getUserDAOs(address user) external view returns (uint256[])",
  "function getAllDAOs() external view returns (uint256[])",
  "function getDAO(uint256 daoId) external view returns (tuple(string name, string description, address futarchyGovernor, address welfareRegistry, address proposalRegistry, address marketFactory, address privacyCoordinator, address oracleResolver, address ragequitModule, address treasuryVault, address creator, uint256 createdAt, bool active))",
  "function hasDAORole(uint256 daoId, address user, bytes32 role) external view returns (bool)",
  "function DAO_ADMIN_ROLE() external view returns (bytes32)",
  "function createDAO(string memory name, string memory description, address treasuryVault, address[] memory admins) external returns (uint256)"
]

// Check for factory address from environment or deployed config
const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS || import.meta.env.VITE_DAO_FACTORY_ADDRESS || getContractAddress('daoFactory')

// Helper to check if factory is deployed
const isFactoryDeployed = () => {
  return FACTORY_ADDRESS && FACTORY_ADDRESS !== ethers.ZeroAddress && FACTORY_ADDRESS !== null
}

// Date validation constants
const MIN_VALID_DATE = new Date('2000-01-01T00:00:00Z').getTime()
const MAX_VALID_DATE = new Date('2100-01-01T00:00:00Z').getTime()

// Demo DAO data
const DEMO_USER_DAOS = [
  {
    id: '1',
    name: 'Ethereum Classic Governance',
    description: 'The primary governance DAO for Ethereum Classic ecosystem decisions and treasury management.',
    creator: '0x9012345678901234567890123456789012345678',
    createdAt: BigInt(Date.now() - 90 * 24 * 60 * 60 * 1000),
    active: true,
    memberCount: 1247,
    treasuryBalance: '125,000 ETC',
    proposalCount: 24
  },
  {
    id: '2',
    name: 'DeFi Innovation Fund',
    description: 'A community-driven fund for supporting innovative DeFi projects on Ethereum Classic.',
    creator: '0x3333345678901234567890123456789012345678',
    createdAt: BigInt(Date.now() - 45 * 24 * 60 * 60 * 1000),
    active: true,
    memberCount: 523,
    treasuryBalance: '45,000 ETC',
    proposalCount: 12
  },
  {
    id: '3',
    name: 'Research & Development DAO',
    description: 'Funding and coordinating research initiatives for blockchain scalability and security.',
    creator: '0xCCCC345678901234567890123456789012345678',
    createdAt: BigInt(Date.now() - 120 * 24 * 60 * 60 * 1000),
    active: true,
    memberCount: 89,
    treasuryBalance: '78,500 ETC',
    proposalCount: 8
  }
]

const DEMO_ALL_DAOS = [
  {
    id: '4',
    name: 'NFT Creators Collective',
    description: 'A DAO for NFT artists and creators to collaborate and share resources on ETC.',
    creator: '0x5555345678901234567890123456789012345678',
    createdAt: BigInt(Date.now() - 30 * 24 * 60 * 60 * 1000),
    active: true,
    memberCount: 312,
    treasuryBalance: '12,000 ETC',
    proposalCount: 6
  },
  {
    id: '5',
    name: 'Infrastructure Builders Guild',
    description: 'Supporting core infrastructure development for the Ethereum Classic network.',
    creator: '0xEEEE345678901234567890123456789012345678',
    createdAt: BigInt(Date.now() - 60 * 24 * 60 * 60 * 1000),
    active: true,
    memberCount: 156,
    treasuryBalance: '95,000 ETC',
    proposalCount: 15
  },
  {
    id: '6',
    name: 'Education & Outreach DAO',
    description: 'Promoting blockchain education and community outreach programs worldwide.',
    creator: '0x0008345678901234567890123456789012345678',
    createdAt: BigInt(Date.now() - 15 * 24 * 60 * 60 * 1000),
    active: true,
    memberCount: 678,
    treasuryBalance: '22,500 ETC',
    proposalCount: 4
  }
]

const DEMO_PROPOSALS = [
  {
    id: 'prop-1',
    title: 'Treasury Diversification Strategy',
    description: 'Proposal to diversify 20% of treasury holdings into stable assets.',
    daoId: '1',
    daoName: 'Ethereum Classic Governance',
    status: 'active',
    votesFor: 847,
    votesAgainst: 234,
    endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    creator: '0x1234567890123456789012345678901234567890'
  },
  {
    id: 'prop-2',
    title: 'Grant Program Q1 2026',
    description: 'Allocate 10,000 ETC for developer grants in Q1 2026.',
    daoId: '2',
    daoName: 'DeFi Innovation Fund',
    status: 'active',
    votesFor: 412,
    votesAgainst: 89,
    endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    creator: '0x2345678901234567890123456789012345678901'
  },
  {
    id: 'prop-3',
    title: 'Research Partnership with University',
    description: 'Establish formal research partnership with leading blockchain research institution.',
    daoId: '3',
    daoName: 'Research & Development DAO',
    status: 'pending',
    votesFor: 45,
    votesAgainst: 12,
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    creator: '0x3456789012345678901234567890123456789012'
  }
]

function ClearPathModal({ isOpen = true, onClose = () => {}, defaultTab = 'daos' }) {
  const { provider } = useEthers()
  const { account } = useAccount()
  const { preferences } = useUserPreferences()
  const demoMode = preferences?.demoMode ?? true

  // Tab state
  const [activeTab, setActiveTab] = useState(defaultTab)

  // Data state
  const [userDAOs, setUserDAOs] = useState([])
  const [allDAOs, setAllDAOs] = useState([])
  const [proposals, setProposals] = useState([])

  // Loading states
  const [loading, setLoading] = useState(true)
  const [browseLoading, setBrowseLoading] = useState(false)

  // Error states
  const [error, setError] = useState(null)
  const [browseError, setBrowseError] = useState(null)

  // Selected item for detail view
  const [selectedDAO, setSelectedDAO] = useState(null)
  const [selectedProposal, setSelectedProposal] = useState(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab)
      setSelectedDAO(null)
      setSelectedProposal(null)
      setError(null)
      setBrowseError(null)
    }
  }, [isOpen, defaultTab])

  // Load demo data
  const loadDemoData = useCallback(() => {
    setLoading(true)
    setError(null)
    setTimeout(() => {
      setUserDAOs(DEMO_USER_DAOS)
      setProposals(DEMO_PROPOSALS)
      setLoading(false)
    }, 300)
  }, [])

  const loadDemoAllDAOs = useCallback(() => {
    setBrowseLoading(true)
    setBrowseError(null)
    setTimeout(() => {
      setAllDAOs(DEMO_ALL_DAOS)
      setBrowseLoading(false)
    }, 300)
  }, [])

  // Load real data
  const loadUserDAOs = useCallback(async () => {
    if (demoMode) {
      loadDemoData()
      return
    }

    try {
      setLoading(true)
      setError(null)
      const factory = new ethers.Contract(FACTORY_ADDRESS, DAOFactoryABI, provider)
      const daoIds = await factory.getUserDAOs(account)

      // Batch fetch all DAO data in parallel
      const daoPromises = daoIds.map(daoId => factory.getDAO(daoId))
      const daoResults = await Promise.all(daoPromises)
      
      const daos = daoResults.map((dao, index) => ({
        id: daoIds[index].toString(),
        ...dao
      }))

      setUserDAOs(daos)
    } catch (err) {
      console.error('Error loading user DAOs:', err)
      let errorMessage = 'Failed to load your DAOs'
      if (err.code === 'NETWORK_ERROR') {
        errorMessage = 'Network error: Please check your connection'
      } else if (err.code === 'CALL_EXCEPTION') {
        errorMessage = 'Contract error: Please verify contract address and network'
      } else if (err.message?.includes('missing provider')) {
        errorMessage = 'Please connect your wallet first'
      } else if (err.message) {
        errorMessage = `Error: ${err.message}`
      }
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [provider, account, demoMode, loadDemoData])

  const loadAllDAOs = useCallback(async () => {
    if (demoMode) {
      loadDemoAllDAOs()
      return
    }

    try {
      setBrowseLoading(true)
      setBrowseError(null)
      const factory = new ethers.Contract(FACTORY_ADDRESS, DAOFactoryABI, provider)
      const allDaoIds = await factory.getAllDAOs()
      const userDaoIds = await factory.getUserDAOs(account)
      const userDaoIdSet = new Set(userDaoIds.map(id => id.toString()))

      // Filter out user DAOs and batch fetch remaining DAO data in parallel
      const browseDaoIds = allDaoIds.filter(daoId => !userDaoIdSet.has(daoId.toString()))
      const daoPromises = browseDaoIds.map(daoId => factory.getDAO(daoId))
      const daoResults = await Promise.all(daoPromises)
      
      const daos = daoResults.map((dao, index) => ({
        id: browseDaoIds[index].toString(),
        ...dao
      }))

      setAllDAOs(daos)
    } catch (err) {
      console.error('Error loading all DAOs:', err)
      let errorMessage = 'Failed to load available DAOs'
      if (err.code === 'NETWORK_ERROR') {
        errorMessage = 'Network error: Please check your connection'
      } else if (err.code === 'CALL_EXCEPTION') {
        errorMessage = 'Contract error: Please verify contract address and network'
      } else if (err.message?.includes('missing provider')) {
        errorMessage = 'Please connect your wallet first'
      } else if (err.message) {
        errorMessage = `Error: ${err.message}`
      }
      setBrowseError(errorMessage)
    } finally {
      setBrowseLoading(false)
    }
  }, [provider, account, demoMode, loadDemoAllDAOs])

  // Load data on mount
  useEffect(() => {
    if (!isOpen) return
    if (demoMode || (provider && account)) {
      loadUserDAOs()
    }
  }, [isOpen, provider, account, demoMode, loadUserDAOs])

  // Load browse data when tab changes
  useEffect(() => {
    if (!isOpen) return
    if (activeTab === 'browse' && (demoMode || (provider && account))) {
      loadAllDAOs()
    }
  }, [isOpen, activeTab, provider, account, demoMode, loadAllDAOs])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose])

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) handleClose()
  }

  // Format helpers
  const formatDate = (dateInput) => {
    // Guard against clearly invalid/empty inputs
    if (dateInput === null || dateInput === undefined || dateInput === '') return 'N/A'

    try {
      const date = typeof dateInput === 'bigint'
        ? new Date(Number(dateInput))
        : new Date(dateInput)

      // Invalid Date handling
      if (Number.isNaN(date.getTime())) return 'N/A'

      // Reasonable date range validation (prevent absurd past/future dates)
      const time = date.getTime()
      if (time < MIN_VALID_DATE || time > MAX_VALID_DATE) return 'N/A'

      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      // In case of any unexpected errors during conversion/formatting
      return 'N/A'
    }
  }

  const formatAddress = (address) => {
    if (!address) return 'N/A'
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'status-active'
      case 'pending': return 'status-pending'
      case 'passed': return 'status-passed'
      case 'rejected': return 'status-rejected'
      default: return 'status-default'
    }
  }

  // User's active proposals
  const userProposals = useMemo(() => {
    return proposals.filter(p =>
      userDAOs.some(d => d.id === p.daoId)
    )
  }, [proposals, userDAOs])

  if (!isOpen) return null

  return (
    <div
      className="clearpath-modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="clearpath-modal-title"
    >
      <div className="clearpath-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="cp-header">
          <div className="cp-header-content">
            <div className="cp-brand">
              <img
                src="/assets/clearpath_no-text_logo.svg"
                alt=""
                className="cp-brand-logo"
                onError={(e) => { e.target.style.display = 'none' }}
              />
              <h2 id="clearpath-modal-title">ClearPath</h2>
            </div>
            <p className="cp-subtitle">Institutional-Grade DAO Governance</p>
          </div>
          <div className="cp-header-actions">
            {demoMode && <span className="cp-demo-badge">Demo</span>}
            <button
              className="cp-close-btn"
              onClick={handleClose}
              aria-label="Close modal"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </header>

        {/* Tab Navigation */}
        <nav className="cp-tabs" role="tablist">
          <button
            className={`cp-tab ${activeTab === 'daos' ? 'active' : ''}`}
            onClick={() => { setActiveTab('daos'); setSelectedDAO(null) }}
            role="tab"
            aria-selected={activeTab === 'daos'}
            aria-controls="panel-daos"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span>My DAOs</span>
            {userDAOs.length > 0 && <span className="cp-tab-badge">{userDAOs.length}</span>}
          </button>
          <button
            className={`cp-tab ${activeTab === 'browse' ? 'active' : ''}`}
            onClick={() => { setActiveTab('browse'); setSelectedDAO(null) }}
            role="tab"
            aria-selected={activeTab === 'browse'}
            aria-controls="panel-browse"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35"/>
            </svg>
            <span>Browse</span>
          </button>
          <button
            className={`cp-tab ${activeTab === 'proposals' ? 'active' : ''}`}
            onClick={() => { setActiveTab('proposals'); setSelectedProposal(null) }}
            role="tab"
            aria-selected={activeTab === 'proposals'}
            aria-controls="panel-proposals"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <span>Proposals</span>
            {userProposals.length > 0 && <span className="cp-tab-badge">{userProposals.length}</span>}
          </button>
          <button
            className={`cp-tab ${activeTab === 'metrics' ? 'active' : ''}`}
            onClick={() => setActiveTab('metrics')}
            role="tab"
            aria-selected={activeTab === 'metrics'}
            aria-controls="panel-metrics"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10"/>
              <line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
            <span>Metrics</span>
          </button>
          <button
            className={`cp-tab ${activeTab === 'launch' ? 'active' : ''}`}
            onClick={() => setActiveTab('launch')}
            role="tab"
            aria-selected={activeTab === 'launch'}
            aria-controls="panel-launch"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span>Launch</span>
          </button>
        </nav>

        {/* Content Area */}
        <div className="cp-content">
          {/* My DAOs Tab */}
          {activeTab === 'daos' && (
            <div id="panel-daos" role="tabpanel" className="cp-panel">
              {selectedDAO ? (
                <DAODetailView
                  dao={selectedDAO}
                  onBack={() => setSelectedDAO(null)}
                  formatDate={formatDate}
                  formatAddress={formatAddress}
                />
              ) : (
                <>
                  {loading ? (
                    <div className="cp-loading">
                      <span className="cp-spinner"></span>
                      <p>Loading your DAOs...</p>
                    </div>
                  ) : error ? (
                    <div className="cp-error-state">
                      <div className="cp-error-icon">&#9888;</div>
                      <h3>Error Loading DAOs</h3>
                      <p>{error}</p>
                      <button className="cp-btn-primary" onClick={loadUserDAOs}>
                        Try Again
                      </button>
                    </div>
                  ) : userDAOs.length === 0 ? (
                    <div className="cp-empty-state">
                      <div className="cp-empty-icon">&#127970;</div>
                      <h3>No DAOs Yet</h3>
                      <p>You haven&apos;t joined any DAOs yet. Browse available DAOs or create your own.</p>
                      <div className="cp-empty-actions">
                        <button className="cp-btn-secondary" onClick={() => setActiveTab('browse')}>
                          Browse DAOs
                        </button>
                        <button className="cp-btn-primary" onClick={() => setActiveTab('launch')}>
                          Launch DAO
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="cp-list">
                      <DAOCompactList
                        daos={userDAOs}
                        onSelect={setSelectedDAO}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Browse Tab */}
          {activeTab === 'browse' && (
            <div id="panel-browse" role="tabpanel" className="cp-panel">
              {selectedDAO ? (
                <DAODetailView
                  dao={selectedDAO}
                  onBack={() => setSelectedDAO(null)}
                  formatDate={formatDate}
                  formatAddress={formatAddress}
                  showJoinButton
                />
              ) : (
                <>
                  {browseLoading ? (
                    <div className="cp-loading">
                      <span className="cp-spinner"></span>
                      <p>Loading available DAOs...</p>
                    </div>
                  ) : browseError ? (
                    <div className="cp-error-state">
                      <div className="cp-error-icon">&#9888;</div>
                      <h3>Error Loading DAOs</h3>
                      <p>{browseError}</p>
                      <button className="cp-btn-primary" onClick={loadAllDAOs}>
                        Try Again
                      </button>
                    </div>
                  ) : allDAOs.length === 0 ? (
                    <div className="cp-empty-state">
                      <div className="cp-empty-icon">&#128269;</div>
                      <h3>No DAOs Available</h3>
                      <p>There are no additional DAOs to join at this time.</p>
                    </div>
                  ) : (
                    <div className="cp-list">
                      <DAOCompactList
                        daos={allDAOs}
                        onSelect={setSelectedDAO}
                        showJoinButton
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Proposals Tab */}
          {activeTab === 'proposals' && (
            <div id="panel-proposals" role="tabpanel" className="cp-panel">
              {selectedProposal ? (
                <ProposalDetailView
                  proposal={selectedProposal}
                  onBack={() => setSelectedProposal(null)}
                  formatDate={formatDate}
                  formatAddress={formatAddress}
                  getStatusClass={getStatusClass}
                />
              ) : (
                <>
                  {userProposals.length === 0 ? (
                    <div className="cp-empty-state">
                      <div className="cp-empty-icon">&#128203;</div>
                      <h3>No Active Proposals</h3>
                      <p>There are no active proposals in your DAOs right now.</p>
                      <button className="cp-btn-primary" onClick={() => setActiveTab('daos')}>
                        View My DAOs
                      </button>
                    </div>
                  ) : (
                    <div className="cp-list">
                      <ProposalCompactList
                        proposals={userProposals}
                        onSelect={setSelectedProposal}
                        formatDate={formatDate}
                        getStatusClass={getStatusClass}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Metrics Tab */}
          {activeTab === 'metrics' && (
            <div id="panel-metrics" role="tabpanel" className="cp-panel">
              <MetricsOverview daos={userDAOs} />
            </div>
          )}

          {/* Launch Tab */}
          {activeTab === 'launch' && (
            <div id="panel-launch" role="tabpanel" className="cp-panel">
              <LaunchDAOForm onSuccess={() => { loadUserDAOs(); setActiveTab('daos') }} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Compact list component for DAOs
 */
function DAOCompactList({ daos, onSelect, showJoinButton = false }) {
  const handleKeyDown = (e, dao) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(dao)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextButton = e.currentTarget.nextElementSibling
      if (nextButton) nextButton.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevButton = e.currentTarget.previousElementSibling
      if (prevButton) prevButton.focus()
    }
  }

  return (
    <div className="cp-dao-list">
      {daos.map((dao, index) => (
        <button
          key={dao.id}
          className="cp-dao-card"
          onClick={() => onSelect(dao)}
          onKeyDown={(e) => handleKeyDown(e, dao)}
          type="button"
          aria-label={`${dao.name}, ${dao.memberCount || 0} members, ${dao.treasuryBalance || '0 ETC'} treasury`}
        >
          <div className="cp-dao-card-main">
            <div className="cp-dao-avatar">
              {dao.name.charAt(0).toUpperCase()}
            </div>
            <div className="cp-dao-info">
              <h3>{dao.name}</h3>
              <p>{dao.description}</p>
            </div>
          </div>
          <div className="cp-dao-card-meta">
            <div className="cp-dao-stat">
              <span className="cp-dao-stat-value">{dao.memberCount || 0}</span>
              <span className="cp-dao-stat-label">Members</span>
            </div>
            <div className="cp-dao-stat">
              <span className="cp-dao-stat-value">{dao.treasuryBalance || '0 ETC'}</span>
              <span className="cp-dao-stat-label">Treasury</span>
            </div>
            {showJoinButton && (
              <span className="cp-join-indicator">Join</span>
            )}
          </div>
          <svg className="cp-dao-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      ))}
    </div>
  )
}

/**
 * DAO detail view component
 */
function DAODetailView({ dao, onBack, formatDate, formatAddress, showJoinButton = false }) {
  return (
    <div className="cp-detail">
      <button type="button" className="cp-back-btn" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to list
      </button>

      <div className="cp-detail-header">
        <div className="cp-dao-avatar cp-dao-avatar-lg">
          {dao.name.charAt(0).toUpperCase()}
        </div>
        <div className="cp-detail-title">
          <h3>{dao.name}</h3>
          <span className={`cp-status-badge ${dao.active ? 'status-active' : 'status-default'}`}>
            {dao.active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      <p className="cp-detail-desc">{dao.description}</p>

      <div className="cp-detail-grid">
        <div className="cp-detail-item">
          <span className="cp-detail-label">Members</span>
          <span className="cp-detail-value">{dao.memberCount || 0}</span>
        </div>
        <div className="cp-detail-item">
          <span className="cp-detail-label">Treasury</span>
          <span className="cp-detail-value">{dao.treasuryBalance || '0 ETC'}</span>
        </div>
        <div className="cp-detail-item">
          <span className="cp-detail-label">Proposals</span>
          <span className="cp-detail-value">{dao.proposalCount || 0}</span>
        </div>
        <div className="cp-detail-item">
          <span className="cp-detail-label">Created</span>
          <span className="cp-detail-value">{formatDate(dao.createdAt)}</span>
        </div>
        <div className="cp-detail-item">
          <span className="cp-detail-label">Creator</span>
          <span className="cp-detail-value cp-mono">{formatAddress(dao.creator)}</span>
        </div>
        <div className="cp-detail-item">
          <span className="cp-detail-label">DAO ID</span>
          <span className="cp-detail-value cp-mono">#{dao.id}</span>
        </div>
      </div>

      <div className="cp-detail-actions">
        {showJoinButton ? (
          <button type="button" className="cp-btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="8.5" cy="7" r="4"/>
              <line x1="20" y1="8" x2="20" y2="14"/>
              <line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
            Join DAO
          </button>
        ) : (
          <>
            <button type="button" className="cp-btn-secondary">
              View Proposals
            </button>
            <button type="button" className="cp-btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Manage DAO
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Compact list component for proposals
 */
function ProposalCompactList({ proposals, onSelect, formatDate, getStatusClass }) {
  const handleKeyDown = (e, proposal) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(proposal)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextButton = e.currentTarget.nextElementSibling
      if (nextButton) nextButton.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevButton = e.currentTarget.previousElementSibling
      if (prevButton) prevButton.focus()
    }
  }

  return (
    <div className="cp-proposal-list">
      {proposals.map((proposal, index) => (
        <button
          key={proposal.id}
          className="cp-proposal-card"
          onClick={() => onSelect(proposal)}
          onKeyDown={(e) => handleKeyDown(e, proposal)}
          type="button"
          aria-label={`${proposal.title}, ${proposal.status} status, ${proposal.votesFor} for, ${proposal.votesAgainst} against`}
        >
          <div className="cp-proposal-main">
            <h3>{proposal.title}</h3>
            <p className="cp-proposal-dao">{proposal.daoName}</p>
          </div>
          <div className="cp-proposal-meta">
            <div className="cp-proposal-votes">
              <span className="cp-votes-for">{proposal.votesFor}</span>
              <span className="cp-votes-separator">/</span>
              <span className="cp-votes-against">{proposal.votesAgainst}</span>
            </div>
            <span className={`cp-status-badge ${getStatusClass(proposal.status)}`}>
              {proposal.status}
            </span>
            <span className="cp-proposal-date">Ends {formatDate(proposal.endDate)}</span>
          </div>
          <svg className="cp-proposal-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      ))}
    </div>
  )
}

/**
 * Proposal detail view component
 */
function ProposalDetailView({ proposal, onBack, formatDate, formatAddress, getStatusClass }) {
  const totalVotes = proposal.votesFor + proposal.votesAgainst
  const forPercentage = totalVotes > 0 ? (proposal.votesFor / totalVotes) * 100 : 0

  return (
    <div className="cp-detail">
      <button type="button" className="cp-back-btn" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back to proposals
      </button>

      <div className="cp-detail-header">
        <h3>{proposal.title}</h3>
        <span className={`cp-status-badge ${getStatusClass(proposal.status)}`}>
          {proposal.status}
        </span>
      </div>

      <p className="cp-proposal-dao-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        </svg>
        {proposal.daoName}
      </p>

      <p className="cp-detail-desc">{proposal.description}</p>

      {totalVotes > 0 ? (
        <div className="cp-vote-progress">
          <div className="cp-vote-bar">
            <div className="cp-vote-bar-for" style={{ width: `${forPercentage}%` }}></div>
          </div>
          <div className="cp-vote-labels">
            <span className="cp-vote-for-label">
              <span className="cp-vote-dot cp-vote-dot-for"></span>
              For: {proposal.votesFor}
            </span>
            <span className="cp-vote-against-label">
              <span className="cp-vote-dot cp-vote-dot-against"></span>
              Against: {proposal.votesAgainst}
            </span>
          </div>
        </div>
      ) : (
        <div className="cp-vote-progress">
          <p className="cp-no-votes-message" style={{ textAlign: 'center', color: '#6B7280', padding: '1rem' }}>
            No votes yet. Be the first to vote on this proposal!
          </p>
        </div>
      )}

      <div className="cp-detail-grid">
        <div className="cp-detail-item">
          <span className="cp-detail-label">Total Votes</span>
          <span className="cp-detail-value">{totalVotes}</span>
        </div>
        <div className="cp-detail-item">
          <span className="cp-detail-label">Ends</span>
          <span className="cp-detail-value">{formatDate(proposal.endDate)}</span>
        </div>
        <div className="cp-detail-item">
          <span className="cp-detail-label">Creator</span>
          <span className="cp-detail-value cp-mono">{formatAddress(proposal.creator)}</span>
        </div>
        <div className="cp-detail-item">
          <span className="cp-detail-label">Proposal ID</span>
          <span className="cp-detail-value cp-mono">{proposal.id}</span>
        </div>
      </div>

      <div className="cp-detail-actions">
        <button type="button" className="cp-btn-vote-against">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/>
          </svg>
          Vote Against
        </button>
        <button type="button" className="cp-btn-vote-for">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
          </svg>
          Vote For
        </button>
      </div>
    </div>
  )
}

/**
 * Metrics overview component
 */
function MetricsOverview({ daos }) {
  const totalMembers = daos.reduce((sum, d) => sum + (d.memberCount || 0), 0)
  const totalProposals = daos.reduce((sum, d) => sum + (d.proposalCount || 0), 0)

  return (
    <div className="cp-metrics">
      <h3 className="cp-section-title">Governance Overview</h3>

      <div className="cp-metrics-grid">
        <div className="cp-metric-card">
          <div className="cp-metric-icon">&#127970;</div>
          <div className="cp-metric-data">
            <span className="cp-metric-value">{daos.length}</span>
            <span className="cp-metric-label">Active DAOs</span>
          </div>
        </div>
        <div className="cp-metric-card">
          <div className="cp-metric-icon">&#128101;</div>
          <div className="cp-metric-data">
            <span className="cp-metric-value">{totalMembers.toLocaleString()}</span>
            <span className="cp-metric-label">Total Members</span>
          </div>
        </div>
        <div className="cp-metric-card">
          <div className="cp-metric-icon">&#128203;</div>
          <div className="cp-metric-data">
            <span className="cp-metric-value">{totalProposals}</span>
            <span className="cp-metric-label">Proposals</span>
          </div>
        </div>
        <div className="cp-metric-card">
          <div className="cp-metric-icon">&#128200;</div>
          <div className="cp-metric-data">
            <span className="cp-metric-value">87%</span>
            <span className="cp-metric-label">Participation Rate</span>
          </div>
        </div>
      </div>

      <div className="cp-welfare-section">
        <h3>Welfare Indicators</h3>
        <div className="cp-welfare-grid">
          <div className="cp-welfare-item">
            <div className="cp-welfare-header">
              <span>Community Health</span>
              <span className="cp-welfare-score">92</span>
            </div>
            <div className="cp-welfare-bar">
              <div className="cp-welfare-fill" style={{ width: '92%' }}></div>
            </div>
          </div>
          <div className="cp-welfare-item">
            <div className="cp-welfare-header">
              <span>Treasury Efficiency</span>
              <span className="cp-welfare-score">78</span>
            </div>
            <div className="cp-welfare-bar">
              <div className="cp-welfare-fill" style={{ width: '78%' }}></div>
            </div>
          </div>
          <div className="cp-welfare-item">
            <div className="cp-welfare-header">
              <span>Governance Activity</span>
              <span className="cp-welfare-score">85</span>
            </div>
            <div className="cp-welfare-bar">
              <div className="cp-welfare-fill" style={{ width: '85%' }}></div>
            </div>
          </div>
          <div className="cp-welfare-item">
            <div className="cp-welfare-header">
              <span>Proposal Success Rate</span>
              <span className="cp-welfare-score">71</span>
            </div>
            <div className="cp-welfare-bar">
              <div className="cp-welfare-fill" style={{ width: '71%' }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Launch DAO form component
 */
function LaunchDAOForm({ onSuccess }) {
  const { signer, account, isConnected } = useEthers()
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    treasuryVault: '',
    admins: ''
  })
  const [errors, setErrors] = useState({})
  const [creating, setCreating] = useState(false)

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.name.trim()) {
      newErrors.name = 'DAO name is required'
    } else if (formData.name.length < 3) {
      newErrors.name = 'Name must be at least 3 characters'
    }
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    } else if (formData.description.length < 20) {
      newErrors.description = 'Description must be at least 20 characters'
    }
    const treasuryVaultAddress = formData.treasuryVault.trim()
    if (treasuryVaultAddress && !ethers.isAddress(treasuryVaultAddress)) {
      newErrors.treasuryVault = 'Treasury vault must be a valid Ethereum address'
    }
    const adminsInput = formData.admins.trim()
    if (adminsInput) {
      const adminAddresses = adminsInput.split(',').map(addr => addr.trim()).filter(Boolean)
      for (const addr of adminAddresses) {
        if (!ethers.isAddress(addr)) {
          newErrors.admins = 'All admin addresses must be valid Ethereum addresses'
          break
        }
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    // Check factory deployment
    if (!isFactoryDeployed()) {
      setErrors({ submit: 'DAO Factory contract is not deployed on this network. DAO creation is temporarily unavailable.' })
      return
    }

    // Check wallet connection
    if (!isConnected || !signer || !account) {
      setErrors({ submit: 'Please connect your wallet to create a DAO' })
      return
    }

    setCreating(true)
    try {
      // Create contract instance with signer
      const factory = new ethers.Contract(FACTORY_ADDRESS, DAOFactoryABI, signer)

      // Parse admin addresses
      const adminAddresses = formData.admins
        ? formData.admins.split(',').map(a => a.trim()).filter(a => a)
        : []

      // Determine treasury vault address
      // If empty, use a zero address which the contract should handle
      const treasuryAddress = formData.treasuryVault.trim() || ethers.ZeroAddress

      // Create DAO transaction
      const tx = await factory.createDAO(
        formData.name,
        formData.description,
        treasuryAddress,
        adminAddresses
      )

      // Wait for transaction confirmation
      const receipt = await tx.wait()

      // Check if transaction was successful
      if (receipt.status === 1) {
        // Clear form data
        setFormData({
          name: '',
          description: '',
          treasuryVault: '',
          admins: ''
        })
        setErrors({})
        
        // Call success callback to refresh DAO list and switch tabs
        onSuccess()
      } else {
        throw new Error('Transaction failed')
      }
    } catch (err) {
      console.error('Error creating DAO:', err)
      
      // Handle common error cases
      let errorMessage = 'Failed to create DAO'
      
      if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
        errorMessage = 'Transaction was rejected by user'
      } else if (err.code === 'INSUFFICIENT_FUNDS') {
        errorMessage = 'Insufficient funds for transaction'
      } else if (err.message?.includes('DAO_CREATOR_ROLE')) {
        errorMessage = 'Your account does not have permission to create DAOs. Please contact an administrator.'
      } else if (err.message?.includes('Name cannot be empty')) {
        errorMessage = 'DAO name cannot be empty'
      } else if (err.message?.includes('Invalid treasury vault')) {
        errorMessage = 'Invalid treasury vault address'
      } else if (err.message) {
        // Try to extract a readable error message
        const match = err.message.match(/reason="([^"]+)"/)
        if (match) {
          errorMessage = match[1]
        } else {
          errorMessage = err.message
        }
      }
      
      setErrors({ submit: errorMessage })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="cp-launch">
      <h3 className="cp-section-title">Launch New DAO</h3>
      <p className="cp-launch-desc">Create a new decentralized autonomous organization with futarchy-based governance.</p>

      {!isFactoryDeployed() && (
        <div className="cp-warning-banner">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span>DAO Factory contract is not deployed on this network. DAO creation is temporarily unavailable.</span>
        </div>
      )}

      <form className="cp-launch-form" onSubmit={handleSubmit}>
        <div className="cp-form-group">
          <label htmlFor="dao-name">
            DAO Name <span className="cp-required">*</span>
          </label>
          <input
            id="dao-name"
            type="text"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="e.g., My Community DAO"
            disabled={creating}
            className={errors.name ? 'error' : ''}
            maxLength={50}
          />
          {errors.name && <span className="cp-error">{errors.name}</span>}
        </div>

        <div className="cp-form-group">
          <label htmlFor="dao-description">
            Description <span className="cp-required">*</span>
          </label>
          <textarea
            id="dao-description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Describe your DAO's purpose and goals..."
            disabled={creating}
            className={errors.description ? 'error' : ''}
            rows={3}
            maxLength={500}
          />
          {errors.description && <span className="cp-error">{errors.description}</span>}
        </div>

        <div className="cp-form-group">
          <label htmlFor="treasury-vault">
            Treasury Vault Address
          </label>
          <input
            id="treasury-vault"
            type="text"
            value={formData.treasuryVault}
            onChange={(e) => handleChange('treasuryVault', e.target.value)}
            placeholder="0x... (optional - will create new if empty)"
            disabled={creating}
            className={errors.treasuryVault ? 'error' : ''}
          />
          {errors.treasuryVault && <span className="cp-error">{errors.treasuryVault}</span>}
          <span className="cp-hint">Leave empty to create a new treasury vault</span>
        </div>

        <div className="cp-form-group">
          <label htmlFor="dao-admins">
            Initial Admins
          </label>
          <input
            id="dao-admins"
            type="text"
            value={formData.admins}
            onChange={(e) => handleChange('admins', e.target.value)}
            placeholder="0x123..., 0x456... (comma-separated)"
            disabled={creating}
            className={errors.admins ? 'error' : ''}
          />
          {errors.admins && <span className="cp-error">{errors.admins}</span>}
          <span className="cp-hint">Your address will be added automatically</span>
        </div>

        {errors.submit && (
          <div className="cp-error-banner">{errors.submit}</div>
        )}

        <div className="cp-form-actions">
          <button
            type="submit"
            className="cp-btn-primary cp-btn-lg"
            disabled={creating || !isFactoryDeployed()}
          >
            {creating ? (
              <>
                <span className="cp-spinner-small"></span>
                Creating DAO...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                Launch DAO
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

ClearPathModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  defaultTab: PropTypes.oneOf(['daos', 'browse', 'proposals', 'metrics', 'launch'])
}

export default ClearPathModal
