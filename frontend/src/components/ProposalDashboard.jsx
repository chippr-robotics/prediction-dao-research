import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import './ProposalDashboard.css'

const ProposalRegistryABI = [
  "function getProposalCount() external view returns (uint256)",
  "function proposals(uint256) external view returns (tuple(string title, string description, uint256 fundingAmount, address recipient, uint256 welfareMetricId, uint256 submissionTime, uint256 activationTime, uint8 status, address proposer, uint256 bond, bool bondReturned))"
]

function ProposalDashboard({ daos, provider, signer }) {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, active, pending, completed

  useEffect(() => {
    if (provider && daos.length > 0) {
      loadProposals()
    }
  }, [provider, daos])

  const loadProposals = async () => {
    try {
      setLoading(true)
      const allProposals = []

      for (const dao of daos) {
        const registry = new ethers.Contract(
          dao.proposalRegistry,
          ProposalRegistryABI,
          provider
        )

        const count = await registry.getProposalCount()

        for (let i = 0; i < count; i++) {
          try {
            const proposal = await registry.proposals(i)
            allProposals.push({
              id: i,
              daoId: dao.id,
              daoName: dao.name,
              ...proposal
            })
          } catch (err) {
            console.error(`Error loading proposal ${i}:`, err)
          }
        }
      }

      setProposals(allProposals)
    } catch (error) {
      console.error('Error loading proposals:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusText = (status) => {
    const statuses = ['Pending', 'Active', 'Completed', 'Cancelled']
    return statuses[status] || 'Unknown'
  }

  const getStatusClass = (status) => {
    const classes = ['pending', 'active', 'completed', 'cancelled']
    return classes[status] || ''
  }

  const formatDate = (timestamp) => {
    if (!timestamp || timestamp === 0n) return 'N/A'
    const date = new Date(Number(timestamp) * 1000)
    return date.toLocaleDateString()
  }

  const formatAmount = (amount) => {
    try {
      return ethers.formatEther(amount)
    } catch {
      return '0'
    }
  }

  const filteredProposals = proposals.filter(p => {
    if (filter === 'all') return true
    if (filter === 'active') return p.status === 1
    if (filter === 'pending') return p.status === 0
    if (filter === 'completed') return p.status === 2
    return true
  })

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner"></div>
        <p>Loading proposals...</p>
      </div>
    )
  }

  return (
    <div className="proposal-dashboard">
      <div className="dashboard-controls">
        <div className="filter-buttons">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({proposals.length})
          </button>
          <button
            className={`filter-btn ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            Active ({proposals.filter(p => p.status === 1).length})
          </button>
          <button
            className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            Pending ({proposals.filter(p => p.status === 0).length})
          </button>
          <button
            className={`filter-btn ${filter === 'completed' ? 'active' : ''}`}
            onClick={() => setFilter('completed')}
          >
            Completed ({proposals.filter(p => p.status === 2).length})
          </button>
        </div>

        <button className="refresh-btn" onClick={loadProposals}>
          🔄 Refresh
        </button>
      </div>

      {filteredProposals.length === 0 ? (
        <div className="empty-proposals">
          <div className="empty-icon">📝</div>
          <h3>No {filter !== 'all' ? filter : ''} proposals found</h3>
          <p>There are no proposals matching your filter.</p>
        </div>
      ) : (
        <div className="proposals-list">
          {filteredProposals.map((proposal) => (
            <div key={`${proposal.daoId}-${proposal.id}`} className="proposal-card">
              <div className="proposal-header">
                <div className="proposal-title-area">
                  <h3>{proposal.title}</h3>
                  <span className="dao-badge">{proposal.daoName}</span>
                </div>
                <span className={`status-badge ${getStatusClass(proposal.status)}`}>
                  {getStatusText(proposal.status)}
                </span>
              </div>

              <p className="proposal-description">{proposal.description}</p>

              <div className="proposal-details">
                <div className="detail-item">
                  <span className="detail-label">Funding:</span>
                  <span className="detail-value">{formatAmount(proposal.fundingAmount)} ETC</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Submitted:</span>
                  <span className="detail-value">{formatDate(proposal.submissionTime)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Recipient:</span>
                  <span className="detail-value monospace">
                    {proposal.recipient.substring(0, 10)}...
                  </span>
                </div>
              </div>

              <div className="proposal-actions">
                <button className="action-btn view">View Details</button>
                <button className="action-btn trade">Trade Market</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ProposalDashboard
