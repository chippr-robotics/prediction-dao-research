import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import './Dashboard.css'
import DAOList from './DAOList'
import ProposalDashboard from './ProposalDashboard'
import DAOLaunchpad from './DAOLaunchpad'
import MetricsDashboard from './MetricsDashboard'

const DAOFactoryABI = [
  "function getUserDAOs(address user) external view returns (uint256[])",
  "function getDAO(uint256 daoId) external view returns (tuple(string name, string description, address futarchyGovernor, address welfareRegistry, address proposalRegistry, address marketFactory, address privacyCoordinator, address oracleResolver, address ragequitModule, address treasuryVault, address creator, uint256 createdAt, bool active))",
  "function hasDAORole(uint256 daoId, address user, bytes32 role) external view returns (bool)",
  "function DAO_ADMIN_ROLE() external view returns (bytes32)",
  "function DAO_PARTICIPANT_ROLE() external view returns (bytes32)",
  "function createDAO(string memory name, string memory description, address treasuryVault, address[] memory admins) external returns (uint256)"
]

// Replace with deployed factory address
const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS || '0x0000000000000000000000000000000000000000'

function Dashboard({ provider, signer, account }) {
  const [activeTab, setActiveTab] = useState('daos')
  const [userDAOs, setUserDAOs] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (provider && account) {
      loadUserDAOs()
    }
  }, [provider, account])

  const loadUserDAOs = async () => {
    try {
      setLoading(true)
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
    } finally {
      setLoading(false)
    }
  }

  const renderTabContent = () => {
    if (loading) {
      return (
        <div className="loading">
          <p>Loading your DAOs...</p>
        </div>
      )
    }

    switch (activeTab) {
      case 'daos':
        return <DAOList daos={userDAOs} provider={provider} account={account} />
      case 'proposals':
        return <ProposalDashboard daos={userDAOs} provider={provider} signer={signer} />
      case 'metrics':
        return <MetricsDashboard daos={userDAOs} provider={provider} />
      case 'launchpad':
        return <DAOLaunchpad signer={signer} onDAOCreated={loadUserDAOs} />
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

      <div className="dashboard-tabs">
        <button
          className={`tab-button ${activeTab === 'daos' ? 'active' : ''}`}
          onClick={() => setActiveTab('daos')}
        >
          My DAOs
        </button>
        <button
          className={`tab-button ${activeTab === 'proposals' ? 'active' : ''}`}
          onClick={() => setActiveTab('proposals')}
        >
          Active Proposals
        </button>
        <button
          className={`tab-button ${activeTab === 'metrics' ? 'active' : ''}`}
          onClick={() => setActiveTab('metrics')}
        >
          Welfare Metrics
        </button>
        <button
          className={`tab-button ${activeTab === 'launchpad' ? 'active' : ''}`}
          onClick={() => setActiveTab('launchpad')}
        >
          Launch DAO
        </button>
        {isAdmin && (
          <button
            className={`tab-button ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
          >
            Admin
          </button>
        )}
      </div>

      <div className="dashboard-content">
        {renderTabContent()}
      </div>
    </div>
  )
}

export default Dashboard
