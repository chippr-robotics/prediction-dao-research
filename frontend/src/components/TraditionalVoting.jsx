import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import './TraditionalVoting.css'

const TraditionalGovernorABI = [
  "function createVotingProposal(uint256 proposalId) external returns (uint256)",
  "function castVote(uint256 votingProposalId, uint8 support) external",
  "function queueProposal(uint256 votingProposalId) external",
  "function executeProposal(uint256 votingProposalId) external",
  "function state(uint256 votingProposalId) external view returns (uint8)",
  "function votingProposals(uint256) external view returns (uint256 proposalId, uint256 startBlock, uint256 endBlock, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, uint256 quorum, uint256 executionTime, bool executed, bool canceled)",
  "function getVote(uint256 votingProposalId, address voter) external view returns (bool hasVoted, uint8 vote)",
  "function votingProposalCount() external view returns (uint256)",
  "function governanceToken() external view returns (address)",
  "function votingPeriod() external view returns (uint256)",
  "function quorumPercentage() external view returns (uint256)"
]

const ProposalRegistryABI = [
  "function getProposal(uint256 proposalId) external view returns (address proposer, string memory title, string memory description, uint256 fundingAmount, address recipient, uint256 welfareMetricId, uint8 status, address fundingToken, uint256 startDate, uint256 executionDeadline)",
  "function proposalCount() external view returns (uint256)"
]

const ERC20ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)"
]

const PROPOSAL_STATES = {
  0: 'Pending',
  1: 'Active',
  2: 'Defeated',
  3: 'Succeeded',
  4: 'Queued',
  5: 'Executed',
  6: 'Canceled'
}

const VOTE_TYPES = {
  0: 'Against',
  1: 'For',
  2: 'Abstain'
}

function TraditionalVoting({ governorAddress, registryAddress, provider, account }) {
  const [votingProposals, setVotingProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [castingVote, setCastingVote] = useState({})
  const [tokenSymbol, setTokenSymbol] = useState('VOTE')
  const [tokenDecimals, setTokenDecimals] = useState(18)
  const [userVotingPower, setUserVotingPower] = useState('0')
  const [currentBlock, setCurrentBlock] = useState(0)

  useEffect(() => {
    const initializeData = async () => {
      await loadTokenInfo()
      await loadVotingProposals()
    }
    initializeData()
    loadCurrentBlock()
    
    // Update current block periodically
    const interval = setInterval(loadCurrentBlock, 10000) // Every 10 seconds
    return () => clearInterval(interval)
  }, [governorAddress, registryAddress, provider, account])

  const loadCurrentBlock = async () => {
    if (!provider) return
    try {
      const blockNumber = await provider.getBlockNumber()
      setCurrentBlock(blockNumber)
    } catch (error) {
      console.error('Error loading current block:', error)
    }
  }

  const loadTokenInfo = async () => {
    if (!governorAddress || !provider) return
    
    try {
      const governor = new ethers.Contract(governorAddress, TraditionalGovernorABI, provider)
      const tokenAddress = await governor.governanceToken()
      const token = new ethers.Contract(tokenAddress, ERC20ABI, provider)
      
      const symbol = await token.symbol()
      const decimals = await token.decimals()
      
      setTokenSymbol(symbol)
      setTokenDecimals(decimals)
      
      // Only load user voting power if account is connected
      if (account) {
        const balance = await token.balanceOf(account)
        setUserVotingPower(ethers.formatUnits(balance, decimals))
      }
    } catch (error) {
      console.error('Error loading token info:', error)
    }
  }

  const loadVotingProposals = async () => {
    if (!governorAddress || !registryAddress || !provider) return
    
    try {
      setLoading(true)
      setError(null)
      
      const governor = new ethers.Contract(governorAddress, TraditionalGovernorABI, provider)
      const registry = new ethers.Contract(registryAddress, ProposalRegistryABI, provider)
      
      const count = await governor.votingProposalCount()
      const proposals = []
      
      for (let i = 0; i < count; i++) {
        const voting = await governor.votingProposals(i)
        const proposal = await registry.getProposal(voting.proposalId)
        const state = await governor.state(i)
        
        let userVote = null
        if (account) {
          const [hasVoted, vote] = await governor.getVote(i, account)
          if (hasVoted) {
            userVote = Number(vote)
          }
        }
        
        proposals.push({
          id: i,
          proposalId: Number(voting.proposalId),
          title: proposal[1],
          description: proposal[2],
          fundingAmount: ethers.formatEther(proposal[3]),
          recipient: proposal[4],
          startBlock: Number(voting.startBlock),
          endBlock: Number(voting.endBlock),
          forVotes: ethers.formatUnits(voting.forVotes, tokenDecimals),
          againstVotes: ethers.formatUnits(voting.againstVotes, tokenDecimals),
          abstainVotes: ethers.formatUnits(voting.abstainVotes, tokenDecimals),
          quorum: ethers.formatUnits(voting.quorum, tokenDecimals),
          executionTime: Number(voting.executionTime),
          executed: voting.executed,
          canceled: voting.canceled,
          state: Number(state),
          userVote
        })
      }
      
      setVotingProposals(proposals.reverse()) // Most recent first
    } catch (error) {
      console.error('Error loading voting proposals:', error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleVote = async (votingProposalId, support) => {
    if (!account || !provider) return
    
    try {
      setCastingVote(prev => ({ ...prev, [votingProposalId]: true }))
      
      const signer = await provider.getSigner()
      const governor = new ethers.Contract(governorAddress, TraditionalGovernorABI, signer)
      
      const tx = await governor.castVote(votingProposalId, support)
      await tx.wait()
      
      // Reload proposals to update UI
      await loadVotingProposals()
      await loadTokenInfo()
    } catch (error) {
      console.error('Error casting vote:', error)
      alert(`Error casting vote: ${error.message}`)
    } finally {
      setCastingVote(prev => ({ ...prev, [votingProposalId]: false }))
    }
  }

  const handleQueue = async (votingProposalId) => {
    if (!account || !provider) return
    
    try {
      setCastingVote(prev => ({ ...prev, [votingProposalId]: true }))
      
      const signer = await provider.getSigner()
      const governor = new ethers.Contract(governorAddress, TraditionalGovernorABI, signer)
      
      const tx = await governor.queueProposal(votingProposalId)
      await tx.wait()
      
      await loadVotingProposals()
    } catch (error) {
      console.error('Error queueing proposal:', error)
      alert(`Error queueing proposal: ${error.message}`)
    } finally {
      setCastingVote(prev => ({ ...prev, [votingProposalId]: false }))
    }
  }

  const getStateColor = (state) => {
    switch (state) {
      case 1: return 'blue' // Active
      case 2: return 'red' // Defeated
      case 3: return 'green' // Succeeded
      case 4: return 'orange' // Queued
      case 5: return 'gray' // Executed
      case 6: return 'gray' // Canceled
      default: return 'gray' // Pending
    }
  }

  const getVotePercentage = (votes, total) => {
    if (total === '0' || parseFloat(total) === 0) return '0'
    return ((parseFloat(votes) / parseFloat(total)) * 100).toFixed(1)
  }

  const getTotalVotes = (proposal) => {
    return (parseFloat(proposal.forVotes) + parseFloat(proposal.againstVotes) + parseFloat(proposal.abstainVotes)).toString()
  }

  const getBlocksRemaining = (proposal) => {
    if (currentBlock === 0) return null
    const remaining = proposal.endBlock - currentBlock
    return remaining > 0 ? remaining : 0
  }

  const canVote = (proposal) => {
    return proposal.state === 1 && proposal.userVote === null
  }

  const canQueue = (proposal) => {
    return proposal.state === 3
  }

  if (loading) {
    return <div className="traditional-voting loading">Loading voting proposals...</div>
  }

  if (error) {
    return <div className="traditional-voting error">Error: {error}</div>
  }

  return (
    <div className="traditional-voting">
      <div className="voting-header">
        <h2>Traditional Voting</h2>
        <div className="voting-info">
          <div className="info-item">
            <span className="label">Your Voting Power:</span>
            <span className="value">{parseFloat(userVotingPower).toFixed(2)} {tokenSymbol}</span>
          </div>
          <div className="info-item">
            <span className="label">Current Block:</span>
            <span className="value">{currentBlock}</span>
          </div>
        </div>
      </div>

      {votingProposals.length === 0 ? (
        <div className="no-proposals">
          <p>No voting proposals yet.</p>
        </div>
      ) : (
        <div className="proposals-list">
          {votingProposals.map((proposal) => {
            const totalVotes = getTotalVotes(proposal)
            const blocksRemaining = getBlocksRemaining(proposal)
            
            return (
              <div key={proposal.id} className="voting-proposal-card">
                <div className="proposal-header">
                  <h3>{proposal.title}</h3>
                  <span className={`status-badge ${getStateColor(proposal.state)}`}>
                    {PROPOSAL_STATES[proposal.state]}
                  </span>
                </div>
                
                <p className="proposal-description">{proposal.description}</p>
                
                <div className="proposal-details">
                  <div className="detail-row">
                    <span className="label">Funding Amount:</span>
                    <span className="value">{proposal.fundingAmount} ETC</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Recipient:</span>
                    <span className="value">{proposal.recipient.slice(0, 10)}...{proposal.recipient.slice(-8)}</span>
                  </div>
                  {blocksRemaining !== null && proposal.state === 1 && (
                    <div className="detail-row">
                      <span className="label">Blocks Remaining:</span>
                      <span className="value">{blocksRemaining}</span>
                    </div>
                  )}
                </div>

                <div className="voting-stats">
                  <div className="stat-row">
                    <span className="stat-label">For:</span>
                    <div className="stat-bar-container">
                      <div 
                        className="stat-bar for" 
                        style={{ width: `${getVotePercentage(proposal.forVotes, totalVotes)}%` }}
                      />
                    </div>
                    <span className="stat-value">
                      {parseFloat(proposal.forVotes).toFixed(0)} ({getVotePercentage(proposal.forVotes, totalVotes)}%)
                    </span>
                  </div>
                  
                  <div className="stat-row">
                    <span className="stat-label">Against:</span>
                    <div className="stat-bar-container">
                      <div 
                        className="stat-bar against" 
                        style={{ width: `${getVotePercentage(proposal.againstVotes, totalVotes)}%` }}
                      />
                    </div>
                    <span className="stat-value">
                      {parseFloat(proposal.againstVotes).toFixed(0)} ({getVotePercentage(proposal.againstVotes, totalVotes)}%)
                    </span>
                  </div>
                  
                  <div className="stat-row">
                    <span className="stat-label">Abstain:</span>
                    <div className="stat-bar-container">
                      <div 
                        className="stat-bar abstain" 
                        style={{ width: `${getVotePercentage(proposal.abstainVotes, totalVotes)}%` }}
                      />
                    </div>
                    <span className="stat-value">
                      {parseFloat(proposal.abstainVotes).toFixed(0)} ({getVotePercentage(proposal.abstainVotes, totalVotes)}%)
                    </span>
                  </div>
                  
                  <div className="detail-row quorum-row">
                    <span className="label">Quorum Required:</span>
                    <span className="value">
                      {parseFloat(proposal.quorum).toFixed(0)} {tokenSymbol}
                      {parseFloat(totalVotes) >= parseFloat(proposal.quorum) ? ' ✓' : ' (not met)'}
                    </span>
                  </div>
                </div>

                {proposal.userVote !== null && (
                  <div className="user-vote-indicator">
                    You voted: <strong>{VOTE_TYPES[proposal.userVote]}</strong>
                  </div>
                )}

                {canVote(proposal) && (
                  <div className="voting-buttons">
                    <button 
                      className="vote-button for"
                      onClick={() => handleVote(proposal.id, 1)}
                      disabled={castingVote[proposal.id]}
                    >
                      {castingVote[proposal.id] ? 'Voting...' : 'Vote For'}
                    </button>
                    <button 
                      className="vote-button against"
                      onClick={() => handleVote(proposal.id, 0)}
                      disabled={castingVote[proposal.id]}
                    >
                      {castingVote[proposal.id] ? 'Voting...' : 'Vote Against'}
                    </button>
                    <button 
                      className="vote-button abstain"
                      onClick={() => handleVote(proposal.id, 2)}
                      disabled={castingVote[proposal.id]}
                    >
                      {castingVote[proposal.id] ? 'Voting...' : 'Abstain'}
                    </button>
                  </div>
                )}

                {canQueue(proposal) && (
                  <div className="voting-buttons">
                    <button 
                      className="vote-button queue"
                      onClick={() => handleQueue(proposal.id)}
                      disabled={castingVote[proposal.id]}
                    >
                      {castingVote[proposal.id] ? 'Queueing...' : 'Queue for Execution'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default TraditionalVoting
