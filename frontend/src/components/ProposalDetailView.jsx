import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import './ProposalDetailView.css'
import { useEthers } from '../hooks/useWeb3'

const ProposalRegistryABI = [
  "function proposals(uint256) external view returns (tuple(string title, string description, uint256 fundingAmount, address recipient, uint256 welfareMetricId, uint256 submissionTime, uint256 activationTime, uint8 status, address proposer, uint256 bond, bool bondReturned))",
  "function getProposalMarket(uint256 proposalId) external view returns (address)",
]

const FutarchyMarketABI = [
  "function passToken() external view returns (address)",
  "function failToken() external view returns (address)",
  "function getCurrentPrices() external view returns (uint256 passPrice, uint256 failPrice)",
  "function totalLiquidity() external view returns (uint256)",
  "function tradingVolume() external view returns (uint256)",
]

function ProposalDetailView({ proposalId, daoId, dao, onClose }) {
  const { provider } = useEthers()
  const [proposal, setProposal] = useState(null)
  const [marketData, setMarketData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    if (provider && dao) {
      loadProposalDetails()
    }
  }, [provider, dao, proposalId])

  const loadProposalDetails = async () => {
    try {
      setLoading(true)
      const registry = new ethers.Contract(
        dao.proposalRegistry,
        ProposalRegistryABI,
        provider
      )

      const proposalData = await registry.proposals(proposalId)
      setProposal(proposalData)

      // Load market data
      try {
        const marketAddress = await registry.getProposalMarket(proposalId)
        if (marketAddress && marketAddress !== ethers.ZeroAddress) {
          const market = new ethers.Contract(
            marketAddress,
            FutarchyMarketABI,
            provider
          )
          
          const [prices, liquidity, volume] = await Promise.all([
            market.getCurrentPrices(),
            market.totalLiquidity(),
            market.tradingVolume()
          ])

          setMarketData({
            address: marketAddress,
            passPrice: prices[0],
            failPrice: prices[1],
            liquidity,
            volume
          })
        }
      } catch (err) {
        console.error('Error loading market data:', err)
      }

    } catch (error) {
      console.error('Error loading proposal details:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusText = (status) => {
    const statuses = ['Pending', 'Active', 'Completed', 'Cancelled']
    return statuses[status] || 'Unknown'
  }

  const getStatusIcon = (status) => {
    const icons = ['⏳', '✓', '✅', '⛔']
    return icons[status] || '●'
  }

  const formatDate = (timestamp) => {
    if (!timestamp || timestamp === 0n) return 'N/A'
    const date = new Date(Number(timestamp) * 1000)
    return date.toLocaleString()
  }

  const formatAmount = (amount) => {
    try {
      return ethers.formatEther(amount)
    } catch {
      return '0'
    }
  }

  const calculateProbability = (passPrice, failPrice) => {
    if (!passPrice || !failPrice) return 50
    const total = Number(passPrice) + Number(failPrice)
    if (total === 0) return 50
    return Math.round((Number(passPrice) / total) * 100)
  }

  const tabs = ['overview', 'market', 'timeline', 'voting']

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
    }
  }

  if (loading) {
    return (
      <div className="proposal-detail-modal">
        <div className="modal-content">
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading proposal details...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!proposal) {
    return (
      <div className="proposal-detail-modal">
        <div className="modal-content">
          <div className="error-state">
            <p>Failed to load proposal details</p>
            <button onClick={onClose} className="close-button">Close</button>
          </div>
        </div>
      </div>
    )
  }

  const probability = marketData 
    ? calculateProbability(marketData.passPrice, marketData.failPrice)
    : 50

  return (
    <div className="proposal-detail-modal" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button 
          className="modal-close" 
          onClick={onClose}
          aria-label="Close proposal details"
        >
          ×
        </button>

        <div className="proposal-detail-header">
          <div className="header-main">
            <h2>{proposal.title}</h2>
            <span className={`status-badge status-${getStatusText(proposal.status).toLowerCase()}`}>
              <span aria-hidden="true">{getStatusIcon(proposal.status)}</span>
              {getStatusText(proposal.status)}
            </span>
          </div>
          <div className="proposal-meta">
            <span className="meta-item">
              <span className="meta-label">DAO:</span>
              <span className="meta-value">{dao.name}</span>
            </span>
            <span className="meta-item">
              <span className="meta-label">ID:</span>
              <span className="meta-value">#{proposalId}</span>
            </span>
          </div>
        </div>

        <div className="tabs" role="tablist" aria-label="Proposal Information">
          <button
            role="tab"
            aria-selected={activeTab === 'overview'}
            aria-controls="overview-panel"
            tabIndex={activeTab === 'overview' ? 0 : -1}
            className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
            onKeyDown={(e) => handleTabKeyDown(e, 'overview')}
          >
            Overview
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'market'}
            aria-controls="market-panel"
            tabIndex={activeTab === 'market' ? 0 : -1}
            className={`tab ${activeTab === 'market' ? 'active' : ''}`}
            onClick={() => setActiveTab('market')}
            onKeyDown={(e) => handleTabKeyDown(e, 'market')}
          >
            Market Data
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'timeline'}
            aria-controls="timeline-panel"
            tabIndex={activeTab === 'timeline' ? 0 : -1}
            className={`tab ${activeTab === 'timeline' ? 'active' : ''}`}
            onClick={() => setActiveTab('timeline')}
            onKeyDown={(e) => handleTabKeyDown(e, 'timeline')}
          >
            Timeline
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'voting'}
            aria-controls="voting-panel"
            tabIndex={activeTab === 'voting' ? 0 : -1}
            className={`tab ${activeTab === 'voting' ? 'active' : ''}`}
            onClick={() => setActiveTab('voting')}
            onKeyDown={(e) => handleTabKeyDown(e, 'voting')}
          >
            Voting Power
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'overview' && (
            <div role="tabpanel" id="overview-panel" aria-labelledby="overview-tab">
              <div className="detail-section">
                <h3>Description</h3>
                <p className="proposal-description">{proposal.description}</p>
              </div>

              <div className="detail-grid">
                <div className="detail-card">
                  <span className="detail-icon" aria-hidden="true">💰</span>
                  <div className="detail-content">
                    <span className="detail-label">Funding Amount</span>
                    <span className="detail-value">{formatAmount(proposal.fundingAmount)} ETC</span>
                  </div>
                </div>

                <div className="detail-card">
                  <span className="detail-icon" aria-hidden="true">📬</span>
                  <div className="detail-content">
                    <span className="detail-label">Recipient</span>
                    <span className="detail-value monospace">
                      {proposal.recipient.substring(0, 10)}...{proposal.recipient.substring(proposal.recipient.length - 8)}
                    </span>
                  </div>
                </div>

                <div className="detail-card">
                  <span className="detail-icon" aria-hidden="true">👤</span>
                  <div className="detail-content">
                    <span className="detail-label">Proposer</span>
                    <span className="detail-value monospace">
                      {proposal.proposer.substring(0, 10)}...{proposal.proposer.substring(proposal.proposer.length - 8)}
                    </span>
                  </div>
                </div>

                <div className="detail-card">
                  <span className="detail-icon" aria-hidden="true">🔒</span>
                  <div className="detail-content">
                    <span className="detail-label">Bond</span>
                    <span className="detail-value">{formatAmount(proposal.bond)} ETC</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'market' && (
            <div role="tabpanel" id="market-panel" aria-labelledby="market-tab">
              {marketData ? (
                <>
                  <div className="market-probability">
                    <div className="probability-visual">
                      <div className="probability-bar">
                        <div 
                          className="probability-fill pass"
                          style={{ width: `${probability}%` }}
                          aria-label={`PASS token probability: ${probability}%`}
                        ></div>
                      </div>
                      <div className="probability-labels">
                        <span className="prob-label pass">
                          <span aria-hidden="true">↑</span> PASS {probability}%
                        </span>
                        <span className="prob-label fail">
                          <span aria-hidden="true">↓</span> FAIL {100 - probability}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="market-stats">
                    <div className="stat-card">
                      <span className="stat-icon success" aria-hidden="true">↑</span>
                      <div className="stat-content">
                        <span className="stat-label">PASS Token Price</span>
                        <span className="stat-value">{formatAmount(marketData.passPrice)} ETC</span>
                      </div>
                    </div>

                    <div className="stat-card">
                      <span className="stat-icon danger" aria-hidden="true">↓</span>
                      <div className="stat-content">
                        <span className="stat-label">FAIL Token Price</span>
                        <span className="stat-value">{formatAmount(marketData.failPrice)} ETC</span>
                      </div>
                    </div>

                    <div className="stat-card">
                      <span className="stat-icon" aria-hidden="true">💧</span>
                      <div className="stat-content">
                        <span className="stat-label">Total Liquidity</span>
                        <span className="stat-value">{formatAmount(marketData.liquidity)} ETC</span>
                      </div>
                    </div>

                    <div className="stat-card">
                      <span className="stat-icon" aria-hidden="true">📊</span>
                      <div className="stat-content">
                        <span className="stat-label">Trading Volume</span>
                        <span className="stat-value">{formatAmount(marketData.volume)} ETC</span>
                      </div>
                    </div>
                  </div>

                  <div className="market-actions">
                    <button className="action-btn primary">
                      Buy PASS Tokens
                    </button>
                    <button className="action-btn secondary">
                      Buy FAIL Tokens
                    </button>
                  </div>
                </>
              ) : (
                <div className="no-market">
                  <div className="empty-icon" aria-hidden="true">📊</div>
                  <p>No market data available for this proposal</p>
                  <p className="help-text">Market will be created when proposal is activated</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'timeline' && (
            <div role="tabpanel" id="timeline-panel" aria-labelledby="timeline-tab">
              <div className="timeline">
                <div className="timeline-item completed">
                  <div className="timeline-marker" aria-hidden="true">✓</div>
                  <div className="timeline-content">
                    <h4>Proposal Submitted</h4>
                    <p className="timeline-date">{formatDate(proposal.submissionTime)}</p>
                    <p className="timeline-description">
                      Proposal submitted by {proposal.proposer.substring(0, 10)}... with {formatAmount(proposal.bond)} ETC bond
                    </p>
                  </div>
                </div>

                {proposal.activationTime > 0n && (
                  <div className={`timeline-item ${proposal.status >= 1 ? 'completed' : 'pending'}`}>
                    <div className="timeline-marker" aria-hidden="true">
                      {proposal.status >= 1 ? '✓' : '○'}
                    </div>
                    <div className="timeline-content">
                      <h4>Proposal Activated</h4>
                      <p className="timeline-date">{formatDate(proposal.activationTime)}</p>
                      <p className="timeline-description">
                        Prediction market opened for trading
                      </p>
                    </div>
                  </div>
                )}

                <div className={`timeline-item ${proposal.status >= 2 ? 'completed' : 'pending'}`}>
                  <div className="timeline-marker" aria-hidden="true">
                    {proposal.status >= 2 ? '✓' : '○'}
                  </div>
                  <div className="timeline-content">
                    <h4>Proposal Resolved</h4>
                    <p className="timeline-date">
                      {proposal.status >= 2 ? 'Completed' : 'Pending'}
                    </p>
                    <p className="timeline-description">
                      Market resolved and funds distributed
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'voting' && (
            <div role="tabpanel" id="voting-panel" aria-labelledby="voting-tab">
              <div className="voting-info">
                <div className="info-card">
                  <h4>Futarchy Voting Mechanism</h4>
                  <p>
                    This proposal uses futarchy prediction markets for decision-making. 
                    Instead of traditional voting, participants trade PASS and FAIL tokens 
                    to express their belief in the proposal's success.
                  </p>
                </div>

                <div className="voting-details">
                  <h4>How Voting Power Works</h4>
                  <ul>
                    <li>
                      <strong>Market Participation:</strong> Anyone can participate by buying PASS or FAIL tokens
                    </li>
                    <li>
                      <strong>Price Discovery:</strong> Token prices reflect collective wisdom about proposal success
                    </li>
                    <li>
                      <strong>Welfare Metrics:</strong> Resolution based on pre-defined welfare metrics
                    </li>
                    <li>
                      <strong>Automatic Execution:</strong> Proposals execute automatically if market prediction succeeds
                    </li>
                  </ul>
                </div>

                {marketData && (
                  <div className="current-sentiment">
                    <h4>Current Market Sentiment</h4>
                    <div className="sentiment-display">
                      <div className="sentiment-bar">
                        <div 
                          className="sentiment-indicator"
                          style={{ left: `${probability}%` }}
                          aria-label={`Market sentiment: ${probability}% likely to pass`}
                        >
                          <span className="sentiment-value">{probability}%</span>
                          <span className="sentiment-arrow">▼</span>
                        </div>
                      </div>
                      <div className="sentiment-labels">
                        <span>Likely to Fail</span>
                        <span>Neutral</span>
                        <span>Likely to Pass</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProposalDetailView
