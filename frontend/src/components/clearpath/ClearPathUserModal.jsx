import { useState, useEffect, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import { ethers } from 'ethers'
import { useEthers, useAccount } from '../../hooks/useWeb3'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { getContractAddress } from '../../config/contracts'
import './ClearPathModal.css'

/**
 * ClearPathUserModal Component
 *
 * Free user modal for ClearPath with basic governance features.
 * Provides view-only access to DAOs and proposals.
 *
 * Features:
 * - My DAOs: View DAOs you are a member of
 * - Browse: Discover and join new DAOs
 * - Proposals: View and vote on active governance proposals
 *
 * @param {Object} props - Component props
 * @param {boolean} [props.isOpen=true] - Whether the modal is open
 * @param {() => void} [props.onClose=() => {}] - Function to call when modal should close
 * @param {string} [props.defaultTab='browse'] - Default tab to show when modal opens
 */

const DAOFactoryABI = [
  "function getUserDAOs(address user) external view returns (uint256[])",
  "function getAllDAOs() external view returns (uint256[])",
  "function getDAO(uint256 daoId) external view returns (tuple(string name, string description, address futarchyGovernor, address welfareRegistry, address proposalRegistry, address marketFactory, address privacyCoordinator, address oracleResolver, address ragequitModule, address treasuryVault, address creator, uint256 createdAt, bool active))",
  "function hasDAORole(uint256 daoId, address user, bytes32 role) external view returns (bool)"
]

const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS || import.meta.env.VITE_DAO_FACTORY_ADDRESS || getContractAddress('daoFactory')

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
  }
]

function ClearPathUserModal({ isOpen = true, onClose = () => {}, defaultTab = 'browse' }) {
  const { provider } = useEthers()
  const { account, isConnected } = useAccount()
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
    if (dateInput === null || dateInput === undefined || dateInput === '') return 'N/A'

    try {
      const date = typeof dateInput === 'bigint'
        ? new Date(Number(dateInput))
        : new Date(dateInput)

      if (Number.isNaN(date.getTime())) return 'N/A'

      const time = date.getTime()
      if (time < MIN_VALID_DATE || time > MAX_VALID_DATE) return 'N/A'

      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
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
      aria-labelledby="clearpath-user-modal-title"
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
              <h2 id="clearpath-user-modal-title">ClearPath</h2>
            </div>
            <p className="cp-subtitle">DAO Governance Explorer</p>
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

        {/* Tab Navigation - Only 3 tabs for free users */}
        <nav className="cp-tabs" role="tablist">
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
            <span>Browse DAOs</span>
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
        </nav>

        {/* Content Area */}
        <div className="cp-content">
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
                      <button className="cp-btn-primary" onClick={() => setActiveTab('browse')}>
                        Browse DAOs
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
                      <p>You haven&apos;t joined any DAOs yet. Browse available DAOs to get started.</p>
                      <button className="cp-btn-primary" onClick={() => setActiveTab('browse')}>
                        Browse DAOs
                      </button>
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
      {daos.map((dao) => (
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
 * DAO detail view component (view-only for free users)
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
          <button type="button" className="cp-btn-secondary">
            View Proposals
          </button>
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
      {proposals.map((proposal) => (
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

ClearPathUserModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  defaultTab: PropTypes.oneOf(['browse', 'proposals', 'daos'])
}

export default ClearPathUserModal
