import { useState, useEffect, useCallback } from 'react'

function ProposalList() {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)

  const loadProposals = useCallback(async () => {
    try {
      // Mock data for demonstration
      // In production, this would fetch from ProposalRegistry contract
      const mockProposals = [
        {
          id: 0,
          title: 'Fund Core Protocol Development',
          description: 'Funding for Q1 2025 core protocol development team',
          fundingAmount: '10000',
          status: 'Active',
          proposer: '0x1234...5678'
        },
        {
          id: 1,
          title: 'Security Audit Funding',
          description: 'Comprehensive security audit for new features',
          fundingAmount: '5000',
          status: 'Reviewing',
          proposer: '0xabcd...efgh'
        }
      ]

      setProposals(mockProposals)
      setLoading(false)
    } catch (error) {
      console.error('Error loading proposals:', error)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProposals()
  }, [loadProposals])

  const getStatusConfig = (status) => {
    const configs = {
      'Reviewing': { icon: '⏳', color: 'status-reviewing', label: 'Under Review' },
      'Active': { icon: '✓', color: 'status-active', label: 'Active' },
      'Cancelled': { icon: '⛔', color: 'status-cancelled', label: 'Cancelled' },
      'Executed': { icon: '✅', color: 'status-executed', label: 'Executed' },
      'Forfeited': { icon: '❌', color: 'status-forfeited', label: 'Forfeited' }
    }
    return configs[status] || { icon: '●', color: 'status-default', label: status }
  }

  if (loading) {
    return <div className="loading">Loading proposals...</div>
  }

  if (proposals.length === 0) {
    return <div className="no-proposals">No proposals found. Be the first to submit one!</div>
  }

  return (
    <div className="proposal-list">
      {proposals.map((proposal) => {
        const statusConfig = getStatusConfig(proposal.status)
        
        return (
          <div key={proposal.id} className="proposal-card">
            <div className="proposal-header">
              <h3>{proposal.title}</h3>
              <span className={`proposal-status ${statusConfig.color}`}>
                <span className="status-icon" aria-hidden="true">
                  {statusConfig.icon}
                </span>
                {statusConfig.label}
              </span>
            </div>
            
            <p className="proposal-description">{proposal.description}</p>
            
            <div className="proposal-details">
              <div className="detail-item">
                <strong>Funding Amount:</strong> {proposal.fundingAmount} ETC
              </div>
              <div className="detail-item">
                <strong>Proposer:</strong> {proposal.proposer}
              </div>
            </div>

            <div className="proposal-actions">
              <button 
                className="view-button"
                aria-label={`View details for ${proposal.title}`}
              >
                View Details
              </button>
              <button 
                className="trade-button"
                aria-label={`Trade on market for ${proposal.title}`}
              >
                Trade on Market
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ProposalList
