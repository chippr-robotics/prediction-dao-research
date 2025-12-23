import { useState } from 'react'
import './FairWinsApp.css'

function FairWinsApp({ provider, signer, account, onDisconnect, onBack }) {
  const [activeTab, setActiveTab] = useState('markets')

  const shortenAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  return (
    <div className="fairwins-app">
      <header className="fairwins-header">
        <div className="header-content">
          <div className="header-left">
            <button onClick={onBack} className="back-button" title="Back to platform selection">
              ← Back
            </button>
            <div className="branding">
              <div className="brand-logo">
                <img 
                  src="/logo_fairwins.png" 
                  alt="FairWins Logo" 
                  className="logo-image"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
              </div>
              <div className="brand-text">
                <h1>FairWins</h1>
                <p className="subtitle">Open Prediction Markets</p>
              </div>
            </div>
          </div>
          
          <div className="wallet-section">
            <div className="connected-wallet">
              <div className="wallet-info">
                <span className="wallet-address">{shortenAddress(account)}</span>
              </div>
              <button onClick={onDisconnect} className="disconnect-button">
                Disconnect
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="fairwins-main">
        <div className="fairwins-container">
          <div className="welcome-section">
            <h2>Welcome to FairWins</h2>
            <p>
              Create, join, and resolve prediction markets on any topic. FairWins provides 
              a transparent, fair platform for anyone to profit from their knowledge and insights.
            </p>
          </div>

          <div className="fairwins-tabs">
            <button
              className={`tab-button ${activeTab === 'markets' ? 'active' : ''}`}
              onClick={() => setActiveTab('markets')}
            >
              Browse Markets
            </button>
            <button
              className={`tab-button ${activeTab === 'create' ? 'active' : ''}`}
              onClick={() => setActiveTab('create')}
            >
              Create Market
            </button>
            <button
              className={`tab-button ${activeTab === 'my-positions' ? 'active' : ''}`}
              onClick={() => setActiveTab('my-positions')}
            >
              My Positions
            </button>
          </div>

          <div className="fairwins-content">
            {activeTab === 'markets' && (
              <div className="markets-section">
                <h3>Active Prediction Markets</h3>
                <p className="section-description">
                  Explore open markets and trade on outcomes you have insights about.
                </p>
                <div className="markets-placeholder">
                  <div className="placeholder-icon">🎯</div>
                  <p>
                    Prediction markets will be displayed here. Connect to the deployed smart contracts 
                    to browse and participate in active markets.
                  </p>
                  <p className="info-text">
                    FairWins uses the same underlying infrastructure as ClearPath but focuses on 
                    open prediction markets rather than DAO governance.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'create' && (
              <div className="create-section">
                <h3>Create a Prediction Market</h3>
                <p className="section-description">
                  Launch your own prediction market with custom parameters and resolution criteria.
                </p>
                <div className="create-form">
                  <div className="form-group">
                    <label>Market Question</label>
                    <input 
                      type="text" 
                      placeholder="e.g., Will Bitcoin reach $100,000 by end of 2025?"
                      className="form-input"
                    />
                    <small>Be specific and clear about what you're predicting</small>
                  </div>

                  <div className="form-group">
                    <label>Market Description</label>
                    <textarea 
                      placeholder="Provide detailed context and resolution criteria..."
                      className="form-textarea"
                      rows="4"
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Trading Ends</label>
                      <input type="datetime-local" className="form-input" />
                    </div>

                    <div className="form-group">
                      <label>Resolution Date</label>
                      <input type="datetime-local" className="form-input" />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Initial Liquidity (USDC)</label>
                    <input 
                      type="number" 
                      placeholder="1000"
                      className="form-input"
                    />
                    <small>Minimum 100 USDC required</small>
                  </div>

                  <button className="create-market-button">
                    Create Market
                  </button>

                  <div className="info-notice">
                    <strong>Note:</strong> Creating a market requires staking collateral that 
                    will be returned after proper resolution. Make sure your resolution criteria 
                    are clear and verifiable.
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'my-positions' && (
              <div className="positions-section">
                <h3>My Positions</h3>
                <p className="section-description">
                  View and manage your active positions across all markets.
                </p>
                <div className="positions-placeholder">
                  <div className="placeholder-icon">📊</div>
                  <p>
                    Your positions and trading history will appear here once you participate in markets.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="fairwins-footer">
        <p>FairWins: Fair, Flexible Prediction Markets for Everyone</p>
      </footer>
    </div>
  )
}

export default FairWinsApp
