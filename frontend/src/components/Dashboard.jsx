import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import './Dashboard.css'
import DAOList from './DAOList'
import ProposalDashboard from './ProposalDashboard'
import DAOLaunchpad from './DAOLaunchpad'
import MetricsDashboard from './MetricsDashboard'
import ProposalSubmission from './ProposalSubmission'
import { useEthers, useAccount } from '../hooks/useWeb3'
import { useCallback } from 'react'

const DAOFactoryABI = [
  "function getUserDAOs(address user) external view returns (uint256[])",
  "function getAllDAOs() external view returns (uint256[])",
  "function getDAO(uint256 daoId) external view returns (tuple(string name, string description, address futarchyGovernor, address welfareRegistry, address proposalRegistry, address marketFactory, address privacyCoordinator, address oracleResolver, address ragequitModule, address treasuryVault, address creator, uint256 createdAt, bool active))",
  "function hasDAORole(uint256 daoId, address user, bytes32 role) external view returns (bool)",
  "function DAO_ADMIN_ROLE() external view returns (bytes32)",
  "function DAO_PARTICIPANT_ROLE() external view returns (bytes32)",
  "function createDAO(string memory name, string memory description, address treasuryVault, address[] memory admins) external returns (uint256)"
]

// Replace with deployed factory address
const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS || '0x0000000000000000000000000000000000000000'

function Dashboard({ defaultTab = 'daos' }) {
  const { provider } = useEthers()
  const { account } = useAccount()
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [userDAOs, setUserDAOs] = useState([])
  const [allDAOs, setAllDAOs] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [browseLoading, setBrowseLoading] = useState(false)
  const [error, setError] = useState(null)
  const [browseError, setBrowseError] = useState(null)

  const loadUserDAOs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const factory = new ethers.Contract(FACTORY_ADDRESS, DAOFactoryABI, provider)
      
      // Get user's DAO IDs
      const daoIds = await factory.getUserDAOs(account)
      
      // Load DAO details
      const daos = []
      for (let i = 0; i < daoIds.length; i++) {
        const dao = await factory.getDAO(daoIds[i])
        daos.push({
          id: daoIds[i].toString(),
          ...dao
        })
      }
      
      setUserDAOs(daos)
      
      // Check if user is admin of any DAO
      const adminRole = await factory.DAO_ADMIN_ROLE()
      let hasAdminRole = false
      for (let i = 0; i < daoIds.length; i++) {
        const isAdminOfDao = await factory.hasDAORole(daoIds[i], account, adminRole)
        if (isAdminOfDao) {
          hasAdminRole = true
          break
        }
      }
      setIsAdmin(hasAdminRole)
      
    } catch (error) {
      console.error('Error loading user DAOs:', error)
      setError(error.message || 'Failed to load your DAOs')
    } finally {
      setLoading(false)
    }
  }, [provider, account])

  const loadAllDAOs = useCallback(async () => {
    try {
      setBrowseLoading(true)
      setBrowseError(null)
      const factory = new ethers.Contract(FACTORY_ADDRESS, DAOFactoryABI, provider)
      
      // Get all DAO IDs
      const allDaoIds = await factory.getAllDAOs()
      
      // Get user's DAO IDs to filter out
      const userDaoIds = await factory.getUserDAOs(account)
      const userDaoIdSet = new Set(userDaoIds.map(id => id.toString()))
      
      // Load DAO details for DAOs user hasn't joined
      const daos = []
      for (let i = 0; i < allDaoIds.length; i++) {
        const daoId = allDaoIds[i].toString()
        // Only include DAOs the user hasn't joined
        if (!userDaoIdSet.has(daoId)) {
          const dao = await factory.getDAO(allDaoIds[i])
          daos.push({
            id: daoId,
            ...dao
          })
        }
      }
      
      setAllDAOs(daos)
      
    } catch (error) {
      console.error('Error loading all DAOs:', error)
      setBrowseError(error.message || 'Failed to load available DAOs')
    } finally {
      setBrowseLoading(false)
    }
  }, [provider, account])

  useEffect(() => {
    if (provider && account) {
      loadUserDAOs()
    }
  }, [provider, account, loadUserDAOs])

  useEffect(() => {
    if (provider && account && activeTab === 'browse') {
      loadAllDAOs()
    }
  }, [provider, account, activeTab, loadAllDAOs])

  const handleRefresh = () => {
    loadUserDAOs()
    if (activeTab === 'browse') {
      loadAllDAOs()
    }
  }

  // Tab list for ARIA pattern
  const tabs = isAdmin 
    ? ['daos', 'browse', 'proposals', 'submit', 'metrics', 'launchpad', 'admin']
    : ['daos', 'browse', 'proposals', 'submit', 'metrics', 'launchpad']

  // Handle keyboard navigation for ARIA tabs pattern
  const handleTabKeyDown = (e, currentTab) => {
    const currentIndex = tabs.indexOf(currentTab)
    
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const nextIndex = (currentIndex + 1) % tabs.length
      setActiveTab(tabs[nextIndex])
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length
      setActiveTab(tabs[prevIndex])
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveTab(tabs[0])
    } else if (e.key === 'End') {
      e.preventDefault()
      setActiveTab(tabs[tabs.length - 1])
    }
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'daos':
        return (
          <DAOList 
            daos={userDAOs} 
            loading={loading} 
            error={error}
            onRefresh={handleRefresh}
            showJoinButton={false}
          />
        )
      case 'browse':
        return (
          <DAOList 
            daos={allDAOs} 
            loading={browseLoading} 
            error={browseError}
            onRefresh={handleRefresh}
            showJoinButton={true}
          />
        )
      case 'proposals':
        return <ProposalDashboard daos={userDAOs} />
      case 'submit':
        return <ProposalSubmission daos={userDAOs} />
      case 'metrics':
        return <MetricsDashboard daos={userDAOs} />
      case 'launchpad':
        return <DAOLaunchpad onDAOCreated={handleRefresh} />
      default:
        return null
    }
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>DAO Management Dashboard</h2>
        <div className="user-info">
          <span className="dao-count">{userDAOs.length} DAO{userDAOs.length !== 1 ? 's' : ''}</span>
          {isAdmin && <span className="admin-badge">Admin</span>}
        </div>
      </div>

      <div className="dashboard-tabs" role="tablist" aria-label="Dashboard Navigation">
        <button
          role="tab"
          aria-selected={activeTab === 'daos'}
          aria-controls="daos-panel"
          id="daos-tab"
          tabIndex={activeTab === 'daos' ? 0 : -1}
          className={`tab-button ${activeTab === 'daos' ? 'active' : ''}`}
          onClick={() => setActiveTab('daos')}
          onKeyDown={(e) => handleTabKeyDown(e, 'daos')}
        >
          My DAOs
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'browse'}
          aria-controls="browse-panel"
          id="browse-tab"
          tabIndex={activeTab === 'browse' ? 0 : -1}
          className={`tab-button ${activeTab === 'browse' ? 'active' : ''}`}
          onClick={() => setActiveTab('browse')}
          onKeyDown={(e) => handleTabKeyDown(e, 'browse')}
        >
          Browse DAOs
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'proposals'}
          aria-controls="proposals-panel"
          id="proposals-tab"
          tabIndex={activeTab === 'proposals' ? 0 : -1}
          className={`tab-button ${activeTab === 'proposals' ? 'active' : ''}`}
          onClick={() => setActiveTab('proposals')}
          onKeyDown={(e) => handleTabKeyDown(e, 'proposals')}
        >
          Active Proposals
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'submit'}
          aria-controls="submit-panel"
          id="submit-tab"
          tabIndex={activeTab === 'submit' ? 0 : -1}
          className={`tab-button ${activeTab === 'submit' ? 'active' : ''}`}
          onClick={() => setActiveTab('submit')}
          onKeyDown={(e) => handleTabKeyDown(e, 'submit')}
        >
          Submit Proposal
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'metrics'}
          aria-controls="metrics-panel"
          id="metrics-tab"
          tabIndex={activeTab === 'metrics' ? 0 : -1}
          className={`tab-button ${activeTab === 'metrics' ? 'active' : ''}`}
          onClick={() => setActiveTab('metrics')}
          onKeyDown={(e) => handleTabKeyDown(e, 'metrics')}
        >
          Welfare Metrics
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'launchpad'}
          aria-controls="launchpad-panel"
          id="launchpad-tab"
          tabIndex={activeTab === 'launchpad' ? 0 : -1}
          className={`tab-button ${activeTab === 'launchpad' ? 'active' : ''}`}
          onClick={() => setActiveTab('launchpad')}
          onKeyDown={(e) => handleTabKeyDown(e, 'launchpad')}
        >
          Launch DAO
        </button>
        {isAdmin && (
          <button
            role="tab"
            aria-selected={activeTab === 'admin'}
            aria-controls="admin-panel"
            id="admin-tab"
            tabIndex={activeTab === 'admin' ? 0 : -1}
            className={`tab-button ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
            onKeyDown={(e) => handleTabKeyDown(e, 'admin')}
          >
            Admin
          </button>
        )}
      </div>

      <div 
        className="dashboard-content"
        role="tabpanel"
        id={`${activeTab}-panel`}
        aria-labelledby={`${activeTab}-tab`}
        tabIndex="0"
      >
        {renderTabContent()}
      </div>
    </div>
  )
}

export default Dashboard
