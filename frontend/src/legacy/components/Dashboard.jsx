import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import './Dashboard.css'
import DAOList from './DAOList'
import ProposalDashboard from './ProposalDashboard'
import DAOLaunchpad from './DAOLaunchpad'
import MetricsDashboard from './MetricsDashboard'
import ProposalSubmission from './ProposalSubmission'
import LoadingScreen from './ui/LoadingScreen'
import { useEthers, useAccount } from '../hooks/useWeb3'
import { useUserPreferences } from '../hooks/useUserPreferences'
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

// Demo DAO data for demo mode - includes all features and roles
const DEMO_USER_DAOS = [
  {
    id: '1',
    name: 'Ethereum Classic Governance',
    description: 'The primary governance DAO for Ethereum Classic ecosystem decisions and treasury management.',
    futarchyGovernor: '0x1234567890123456789012345678901234567890',
    welfareRegistry: '0x2345678901234567890123456789012345678901',
    proposalRegistry: '0x3456789012345678901234567890123456789012',
    marketFactory: '0x4567890123456789012345678901234567890123',
    privacyCoordinator: '0x5678901234567890123456789012345678901234',
    oracleResolver: '0x6789012345678901234567890123456789012345',
    ragequitModule: '0x7890123456789012345678901234567890123456',
    treasuryVault: '0x8901234567890123456789012345678901234567',
    creator: '0x9012345678901234567890123456789012345678',
    createdAt: BigInt(Date.now() - 90 * 24 * 60 * 60 * 1000),
    active: true,
    memberCount: 1247,
    treasuryBalance: '125,000 ETC'
  },
  {
    id: '2',
    name: 'DeFi Innovation Fund',
    description: 'A community-driven fund for supporting innovative DeFi projects on Ethereum Classic.',
    futarchyGovernor: '0xaaaa567890123456789012345678901234567890',
    welfareRegistry: '0xbbbb678901234567890123456789012345678901',
    proposalRegistry: '0xcccc789012345678901234567890123456789012',
    marketFactory: '0xdddd890123456789012345678901234567890123',
    privacyCoordinator: '0xeeee901234567890123456789012345678901234',
    oracleResolver: '0xffff012345678901234567890123456789012345',
    ragequitModule: '0x1111123456789012345678901234567890123456',
    treasuryVault: '0x2222234567890123456789012345678901234567',
    creator: '0x3333345678901234567890123456789012345678',
    createdAt: BigInt(Date.now() - 45 * 24 * 60 * 60 * 1000),
    active: true,
    memberCount: 523,
    treasuryBalance: '45,000 ETC'
  },
  {
    id: '3',
    name: 'Research & Development DAO',
    description: 'Funding and coordinating research initiatives for blockchain scalability and security.',
    futarchyGovernor: '0x4444567890123456789012345678901234567890',
    welfareRegistry: '0x5555678901234567890123456789012345678901',
    proposalRegistry: '0x6666789012345678901234567890123456789012',
    marketFactory: '0x7777890123456789012345678901234567890123',
    privacyCoordinator: '0x8888901234567890123456789012345678901234',
    oracleResolver: '0x9999012345678901234567890123456789012345',
    ragequitModule: '0xAAAA123456789012345678901234567890123456',
    treasuryVault: '0xBBBB234567890123456789012345678901234567',
    creator: '0xCCCC345678901234567890123456789012345678',
    createdAt: BigInt(Date.now() - 120 * 24 * 60 * 60 * 1000),
    active: true,
    memberCount: 89,
    treasuryBalance: '78,500 ETC'
  }
]

const DEMO_ALL_DAOS = [
  {
    id: '4',
    name: 'NFT Creators Collective',
    description: 'A DAO for NFT artists and creators to collaborate and share resources on ETC.',
    futarchyGovernor: '0xDDDD567890123456789012345678901234567890',
    welfareRegistry: '0xEEEE678901234567890123456789012345678901',
    proposalRegistry: '0xFFFF789012345678901234567890123456789012',
    marketFactory: '0x0000890123456789012345678901234567890123',
    privacyCoordinator: '0x1111901234567890123456789012345678901234',
    oracleResolver: '0x2222012345678901234567890123456789012345',
    ragequitModule: '0x3333123456789012345678901234567890123456',
    treasuryVault: '0x4444234567890123456789012345678901234567',
    creator: '0x5555345678901234567890123456789012345678',
    createdAt: BigInt(Date.now() - 30 * 24 * 60 * 60 * 1000),
    active: true,
    memberCount: 312,
    treasuryBalance: '12,000 ETC'
  },
  {
    id: '5',
    name: 'Infrastructure Builders Guild',
    description: 'Supporting core infrastructure development for the Ethereum Classic network.',
    futarchyGovernor: '0x6666567890123456789012345678901234567890',
    welfareRegistry: '0x7777678901234567890123456789012345678901',
    proposalRegistry: '0x8888789012345678901234567890123456789012',
    marketFactory: '0x9999890123456789012345678901234567890123',
    privacyCoordinator: '0xAAAA901234567890123456789012345678901234',
    oracleResolver: '0xBBBB012345678901234567890123456789012345',
    ragequitModule: '0xCCCC123456789012345678901234567890123456',
    treasuryVault: '0xDDDD234567890123456789012345678901234567',
    creator: '0xEEEE345678901234567890123456789012345678',
    createdAt: BigInt(Date.now() - 60 * 24 * 60 * 60 * 1000),
    active: true,
    memberCount: 156,
    treasuryBalance: '95,000 ETC'
  },
  {
    id: '6',
    name: 'Education & Outreach DAO',
    description: 'Promoting blockchain education and community outreach programs worldwide.',
    futarchyGovernor: '0xFFFF567890123456789012345678901234567890',
    welfareRegistry: '0x0001678901234567890123456789012345678901',
    proposalRegistry: '0x0002789012345678901234567890123456789012',
    marketFactory: '0x0003890123456789012345678901234567890123',
    privacyCoordinator: '0x0004901234567890123456789012345678901234',
    oracleResolver: '0x0005012345678901234567890123456789012345',
    ragequitModule: '0x0006123456789012345678901234567890123456',
    treasuryVault: '0x0007234567890123456789012345678901234567',
    creator: '0x0008345678901234567890123456789012345678',
    createdAt: BigInt(Date.now() - 15 * 24 * 60 * 60 * 1000),
    active: true,
    memberCount: 678,
    treasuryBalance: '22,500 ETC'
  }
]

function Dashboard({ defaultTab = 'daos' }) {
  const { provider } = useEthers()
  const { account } = useAccount()
  const { preferences } = useUserPreferences()
  const demoMode = preferences?.demoMode ?? true
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [userDAOs, setUserDAOs] = useState([])
  const [allDAOs, setAllDAOs] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [browseLoading, setBrowseLoading] = useState(false)
  const [error, setError] = useState(null)
  const [browseError, setBrowseError] = useState(null)

  // Load demo data
  const loadDemoData = useCallback(() => {
    setLoading(true)
    setError(null)
    
    // Simulate brief loading for realistic UX
    setTimeout(() => {
      setUserDAOs(DEMO_USER_DAOS)
      setIsAdmin(true) // In demo mode, user has all roles including admin
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

  const loadUserDAOs = useCallback(async () => {
    // Use demo data if in demo mode
    if (demoMode) {
      loadDemoData()
      return
    }

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
  }, [provider, account, demoMode, loadDemoData])

  const loadAllDAOs = useCallback(async () => {
    // Use demo data if in demo mode
    if (demoMode) {
      loadDemoAllDAOs()
      return
    }

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
  }, [provider, account, demoMode, loadDemoAllDAOs])

  // Load data when component mounts or demoMode changes
  useEffect(() => {
    if (demoMode) {
      // In demo mode, load immediately
      loadUserDAOs()
    } else if (provider && account) {
      // In live mode, need provider and account
      loadUserDAOs()
    }
  }, [provider, account, demoMode, loadUserDAOs])

  useEffect(() => {
    if (activeTab === 'browse') {
      if (demoMode) {
        loadAllDAOs()
      } else if (provider && account) {
        loadAllDAOs()
      }
    }
  }, [provider, account, activeTab, demoMode, loadAllDAOs])

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
          {demoMode && <span className="demo-badge">🎭 Demo Mode</span>}
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
