import { useState } from 'react'
import { ethers } from 'ethers'
import './DAOList.css'
import { useEthers } from '../hooks/useWeb3'
import { useNotification } from '../hooks/useUI'
import { useModal } from '../hooks/useUI'
import LoadingScreen from './ui/LoadingScreen'

const DAOFactoryABI = [
  "function joinDAO(uint256 daoId) external",
  "function hasDAORole(uint256 daoId, address user, bytes32 role) external view returns (bool)",
  "function DAO_PARTICIPANT_ROLE() external view returns (bytes32)"
]

const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS || '0x0000000000000000000000000000000000000000'

function DAOList({ daos, loading, error, onRefresh, showJoinButton = false }) {
  const { signer } = useEthers()
  const { showNotification } = useNotification()
  const { showModal } = useModal()
  const [selectedDAO, setSelectedDAO] = useState(null)
  const [joiningDAO, setJoiningDAO] = useState(null)

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'
    const date = new Date(Number(timestamp) * 1000)
    return date.toLocaleDateString()
  }

  const shortenAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  const handleDAOClick = (dao) => {
    setSelectedDAO(selectedDAO?.id === dao.id ? null : dao)
  }

  const handleJoinDAO = async (dao) => {
    try {
      setJoiningDAO(dao.id)
      const factory = new ethers.Contract(FACTORY_ADDRESS, DAOFactoryABI, signer)

      showModal({
        title: 'Join DAO',
        message: `Are you sure you want to join "${dao.name}"? This will grant you participant access to the DAO.`,
        type: 'confirm',
        onConfirm: async () => {
          try {
            const tx = await factory.joinDAO(dao.id)
            showNotification('Transaction submitted. Waiting for confirmation...', 'info', 0)
            await tx.wait()
            showNotification(`Successfully joined ${dao.name}!`, 'success')
            if (onRefresh) onRefresh()
          } catch (err) {
            console.error('Error joining DAO:', err)
            const errorMsg = err.message || 'Failed to join DAO'
            showNotification(errorMsg, 'error')
          } finally {
            setJoiningDAO(null)
          }
        },
        onCancel: () => {
          setJoiningDAO(null)
        }
      })
    } catch (err) {
      console.error('Error preparing to join DAO:', err)
      showNotification('Failed to prepare join request', 'error')
      setJoiningDAO(null)
    }
  }

  if (loading) {
    return (
      <LoadingScreen 
        visible={true} 
        text="Loading DAOs"
        inline
        size="medium"
      />
    )
  }

  if (error) {
    return (
      <div className="error-state" role="alert" aria-live="assertive">
        <div className="error-icon" aria-hidden="true">⚠️</div>
        <h3>Error Loading DAOs</h3>
        <p>{error}</p>
        {onRefresh && (
          <button onClick={onRefresh} className="retry-button">
            Try Again
          </button>
        )}
      </div>
    )
  }

  if (!daos || daos.length === 0) {
    return (
      <div className="empty-state" role="status">
        <div className="empty-icon" aria-hidden="true">🏛️</div>
        <h3>No DAOs Found</h3>
        <p>{showJoinButton 
          ? 'No DAOs are currently available to join.'
          : "You're not associated with any DAOs yet."
        }</p>
        <p>{showJoinButton
          ? 'Check back later or create your own DAO.'
          : 'Create a new DAO or browse available DAOs to join.'
        }</p>
      </div>
    )
  }

  return (
    <div className="dao-list-container">
      <div className="dao-grid">
        {daos.map((dao) => (
          <article
            key={dao.id}
            className={`dao-card ${selectedDAO?.id === dao.id ? 'selected' : ''} ${!dao.active ? 'inactive' : ''}`}
            onClick={() => handleDAOClick(dao)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleDAOClick(dao)
              }
            }}
            role="button"
            tabIndex={0}
            aria-expanded={selectedDAO?.id === dao.id}
            aria-label={`${dao.name} - ${dao.active ? 'Active' : 'Inactive'} DAO`}
          >
            <div className="dao-card-header">
              <div className="dao-name">
                <h3>{dao.name}</h3>
                {!dao.active && (
                  <span className="inactive-badge" aria-label="Status: Inactive">
                    <span aria-hidden="true">●</span> Inactive
                  </span>
                )}
              </div>
              <div className="dao-id" aria-label={`DAO ID ${dao.id}`}>#{dao.id}</div>
            </div>

            <p className="dao-description">{dao.description}</p>

            <div className="dao-metadata">
              <div className="metadata-item">
                <span className="label">Created:</span>
                <span className="value">{formatDate(dao.createdAt)}</span>
              </div>
              <div className="metadata-item">
                <span className="label">Creator:</span>
                <span className="value" title={dao.creator}>{shortenAddress(dao.creator)}</span>
              </div>
              <div className="metadata-item">
                <span className="label">Treasury:</span>
                <span className="value" title={dao.treasuryVault}>{shortenAddress(dao.treasuryVault)}</span>
              </div>
            </div>

            {selectedDAO?.id === dao.id && (
              <div className="dao-details">
                <h4>Contract Addresses</h4>
                <div className="contract-addresses">
                  <div className="address-item">
                    <span className="contract-name">Governor:</span>
                    <span className="contract-address" title={dao.futarchyGovernor}>{shortenAddress(dao.futarchyGovernor)}</span>
                  </div>
                  <div className="address-item">
                    <span className="contract-name">Welfare Registry:</span>
                    <span className="contract-address" title={dao.welfareRegistry}>{shortenAddress(dao.welfareRegistry)}</span>
                  </div>
                  <div className="address-item">
                    <span className="contract-name">Proposal Registry:</span>
                    <span className="contract-address" title={dao.proposalRegistry}>{shortenAddress(dao.proposalRegistry)}</span>
                  </div>
                  <div className="address-item">
                    <span className="contract-name">Market Factory:</span>
                    <span className="contract-address" title={dao.marketFactory}>{shortenAddress(dao.marketFactory)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="dao-actions" onClick={(e) => e.stopPropagation()}>
              <button 
                className="action-btn primary"
                aria-label={`View details for ${dao.name}`}
              >
                View Details
              </button>
              {showJoinButton ? (
                <button 
                  className="action-btn join"
                  onClick={() => handleJoinDAO(dao)}
                  disabled={joiningDAO === dao.id || !dao.active}
                  aria-label={`Join ${dao.name}`}
                >
                  {joiningDAO === dao.id ? 'Joining...' : 'Join DAO'}
                </button>
              ) : (
                <button 
                  className="action-btn secondary"
                  aria-label={`Create proposal in ${dao.name}`}
                >
                  Create Proposal
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

export default DAOList
