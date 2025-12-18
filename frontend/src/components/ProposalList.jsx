import { useState, useEffect } from 'react'

function ProposalList({ provider, signer }) {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProposals()
  }, [provider])

  const loadProposals = async () => {
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
  }

  const getStatusColor = (status) => {
    const colors = {
      'Reviewing': '#ffa500',
      'Active': '#4caf50',
      'Cancelled': '#9e9e9e',
      'Executed': '#2196f3',
      'Forfeited': '#f44336'
    }
    return colors[status] || '#9e9e9e'
  }

  if (loading) {
    return <div className="loading">Loading proposals...</div>
  }

  if (proposals.length === 0) {
    return <div className="no-proposals">No proposals found. Be the first to submit one!</div>
  }

  return (
    <div className="proposal-list">
      {proposals.map((proposal) => (
        <div key={proposal.id} className="proposal-card">
          <div className="proposal-header">
            <h3>{proposal.title}</h3>
            <span 
              className="proposal-status"
              style={{ backgroundColor: getStatusColor(proposal.status) }}
            >
              {proposal.status}
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
            <button className="view-button">View Details</button>
            <button className="trade-button">Trade on Market</button>
          </div>
        </div>
      ))}
    </div>
  )
}

export default ProposalList
