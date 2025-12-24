import { useState } from 'react'
import './DAOList.css'
import { useEthers, useAccount } from '../hooks/useWeb3'

function DAOList({ daos }) {
  const { provider } = useEthers()
  const { account } = useAccount()
  const [selectedDAO, setSelectedDAO] = useState(null)

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

  if (daos.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🏛️</div>
        <h3>No DAOs Found</h3>
        <p>You're not associated with any DAOs yet.</p>
        <p>Create a new DAO or ask to be added to an existing one.</p>
      </div>
    )
  }

  return (
    <div className="dao-list-container">
      <div className="dao-grid">
        {daos.map((dao) => (
          <div
            key={dao.id}
            className={`dao-card ${selectedDAO?.id === dao.id ? 'selected' : ''} ${!dao.active ? 'inactive' : ''}`}
            onClick={() => handleDAOClick(dao)}
          >
            <div className="dao-card-header">
              <div className="dao-name">
                <h3>{dao.name}</h3>
                {!dao.active && <span className="inactive-badge">Inactive</span>}
              </div>
              <div className="dao-id">#{dao.id}</div>
            </div>

            <p className="dao-description">{dao.description}</p>

            <div className="dao-metadata">
              <div className="metadata-item">
                <span className="label">Created:</span>
                <span className="value">{formatDate(dao.createdAt)}</span>
              </div>
              <div className="metadata-item">
                <span className="label">Creator:</span>
                <span className="value">{shortenAddress(dao.creator)}</span>
              </div>
              <div className="metadata-item">
                <span className="label">Treasury:</span>
                <span className="value">{shortenAddress(dao.treasuryVault)}</span>
              </div>
            </div>

            {selectedDAO?.id === dao.id && (
              <div className="dao-details">
                <h4>Contract Addresses</h4>
                <div className="contract-addresses">
                  <div className="address-item">
                    <span className="contract-name">Governor:</span>
                    <span className="contract-address">{shortenAddress(dao.futarchyGovernor)}</span>
                  </div>
                  <div className="address-item">
                    <span className="contract-name">Welfare Registry:</span>
                    <span className="contract-address">{shortenAddress(dao.welfareRegistry)}</span>
                  </div>
                  <div className="address-item">
                    <span className="contract-name">Proposal Registry:</span>
                    <span className="contract-address">{shortenAddress(dao.proposalRegistry)}</span>
                  </div>
                  <div className="address-item">
                    <span className="contract-name">Market Factory:</span>
                    <span className="contract-address">{shortenAddress(dao.marketFactory)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="dao-actions">
              <button className="action-btn primary">View Details</button>
              <button className="action-btn secondary">Create Proposal</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DAOList
