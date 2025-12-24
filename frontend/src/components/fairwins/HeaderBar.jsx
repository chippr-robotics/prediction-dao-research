import './HeaderBar.css'

function HeaderBar({ onConnect, onDisconnect, onBack, isConnected, account }) {
  const shortenAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  const handleConnectClick = async () => {
    if (onConnect) {
      await onConnect()
    }
  }

  return (
    <header className="header-bar">
      <div className="header-content">
        <div className="header-left">
          {onBack && (
            <button 
              onClick={onBack} 
              className="back-button" 
              aria-label="Back to platform selection"
            >
              ← Back
            </button>
          )}
          <div className="header-branding">
            <div className="brand-logo">
              <img 
                src="/logo_fairwins.svg" 
                alt="FairWins Logo" 
                className="logo-image"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            </div>
            <div className="brand-text">
              <h1>FairWins</h1>
              <p className="tagline">Prediction Markets</p>
            </div>
          </div>
        </div>

        <div className="header-center">
          <div className="search-box">
            <input 
              type="search" 
              placeholder="Search markets..." 
              className="search-input"
              aria-label="Search markets"
            />
            <span className="search-icon" aria-hidden="true">🔍</span>
          </div>
        </div>

        <div className="header-right">
          {isConnected ? (
            <div className="wallet-connected">
              <div className="wallet-info">
                <span className="connection-status" aria-label="Wallet connected">
                  <span className="status-dot" aria-hidden="true"></span>
                  <span className="wallet-address">{shortenAddress(account)}</span>
                </span>
              </div>
              <button 
                onClick={onDisconnect} 
                className="disconnect-btn"
                aria-label="Disconnect wallet"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button 
              onClick={handleConnectClick} 
              className="connect-btn"
              aria-label="Connect wallet"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

export default HeaderBar
