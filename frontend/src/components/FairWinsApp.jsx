import { useState } from 'react'
import './FairWinsApp.css'
import { useWeb3, useNetwork } from '../hooks/useWeb3'
import BlockiesAvatar from './ui/BlockiesAvatar'
import MarketTrading from './MarketTrading'
import MyPositions from './MyPositions'
import MarketCreation from './MarketCreation'

function FairWinsApp({ onConnect, onDisconnect, onBack }) {
  const { account, isConnected } = useWeb3()
  const { networkError } = useNetwork()
  const [activeTab, setActiveTab] = useState('markets')

  const shortenAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  const handleConnectClick = async () => {
    await onConnect()
  }

  // Handle keyboard navigation for ARIA tabs pattern
  const tabs = ['markets', 'create', 'my-positions']
  
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

  return (
    <div className="fairwins-app">
      {/* Skip to main content link for keyboard navigation */}
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      
      <header className="fairwins-header">
        <div className="fairwins-header-content">
          <div className="fairwins-header-left">
            <button 
              onClick={onBack} 
              className="fairwins-back-button" 
              aria-label="Back to platform selection"
            >
              ← Back
            </button>
            <div className="fairwins-branding">
              <div className="fairwins-brand-logo">
                <img 
                  src="/logo_fairwins.svg" 
                  alt="FairWins Logo" 
                  className="logo-image"
                  width="40"
                  height="40"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
              </div>
              <div className="fairwins-brand-text">
                <h1>FairWins</h1>
                <p className="subtitle">Open Prediction Markets</p>
              </div>
            </div>
          </div>
          
          <div className="fairwins-wallet-section">
            {isConnected ? (
              <div className="fairwins-connected-wallet">
                <div className="fairwins-wallet-info">
                  <span className="fairwins-connection-status" aria-label="Wallet connected">
                    <BlockiesAvatar address={account} size={24} className="wallet-avatar-inline" />
                    <span className="fairwins-wallet-address">{shortenAddress(account)}</span>
                  </span>
                </div>
                <button 
                  onClick={onDisconnect} 
                  className="fairwins-disconnect-button"
                  aria-label="Disconnect wallet"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button 
                onClick={handleConnectClick} 
                className="fairwins-connect-button"
                aria-label="Connect wallet"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" className="fairwins-main" tabIndex="-1">
        {networkError ? (
          <div className="network-error-message" role="alert">
            <div className="error-icon" aria-hidden="true">⚠️</div>
            <h2>Network Mismatch</h2>
            <p>{networkError}</p>
            <p className="error-help">Please switch to the correct network to continue.</p>
          </div>
        ) : (
          <div className="fairwins-container">
            <div className="welcome-section">
              <h2>Welcome to FairWins</h2>
              <p>
                Create, join, and resolve prediction markets on any topic. FairWins provides 
                a transparent, fair platform for anyone to profit from their knowledge and insights.
              </p>
            </div>

            <div className="fairwins-tabs" role="tablist" aria-label="FairWins Navigation">
              <button
                role="tab"
                aria-selected={activeTab === 'markets'}
                aria-controls="markets-panel"
                id="markets-tab"
                tabIndex={activeTab === 'markets' ? 0 : -1}
                className={`tab-button ${activeTab === 'markets' ? 'active' : ''}`}
                onClick={() => setActiveTab('markets')}
                onKeyDown={(e) => handleTabKeyDown(e, 'markets')}
              >
                Browse Markets
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'create'}
                aria-controls="create-panel"
                id="create-tab"
                tabIndex={activeTab === 'create' ? 0 : -1}
                className={`tab-button ${activeTab === 'create' ? 'active' : ''}`}
                onClick={() => setActiveTab('create')}
                onKeyDown={(e) => handleTabKeyDown(e, 'create')}
              >
                Create Market
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'my-positions'}
                aria-controls="my-positions-panel"
                id="my-positions-tab"
                tabIndex={activeTab === 'my-positions' ? 0 : -1}
                className={`tab-button ${activeTab === 'my-positions' ? 'active' : ''}`}
                onClick={() => setActiveTab('my-positions')}
                onKeyDown={(e) => handleTabKeyDown(e, 'my-positions')}
              >
                My Positions
              </button>
            </div>

            <div 
              className="fairwins-content"
              role="tabpanel"
              id={`${activeTab}-panel`}
              aria-labelledby={`${activeTab}-tab`}
              tabIndex="0"
            >
              {activeTab === 'markets' && (
                <div className="markets-section">
                  <MarketTrading />
                </div>
              )}

              {activeTab === 'create' && (
                <div className="create-section">
                  <MarketCreation />
                </div>
              )}

              {activeTab === 'my-positions' && (
                <div className="positions-section">
                  <MyPositions />
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="fairwins-footer">
        <p>FairWins: Fair, Flexible Prediction Markets for Everyone</p>
      </footer>
    </div>
  )
}

export default FairWinsApp
