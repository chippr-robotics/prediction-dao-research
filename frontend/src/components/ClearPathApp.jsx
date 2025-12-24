import './ClearPathApp.css'
import Dashboard from './Dashboard'

function ClearPathApp({ provider, signer, account, onDisconnect, onBack, networkError }) {
  const shortenAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  return (
    <div className="clearpath-app">
      <header className="clearpath-header">
        <div className="header-content">
          <div className="header-left">
            <button onClick={onBack} className="back-button" title="Back to platform selection">
              ← Back
            </button>
            <div className="branding">
              <div className="brand-logo">
                <img 
                  src="/logo_clearpath.png" 
                  alt="ClearPath Logo" 
                  className="logo-image"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
              </div>
              <div className="brand-text">
                <h1>ClearPath</h1>
                <p className="subtitle">DAO Governance Platform</p>
              </div>
            </div>
          </div>
          
          <div className="wallet-section">
            <div className="connected-wallet">
              <div className="wallet-info">
                <span className="connection-status" aria-label="Wallet connected">
                  <span className="status-indicator" aria-hidden="true">●</span>
                  <span className="wallet-address">{shortenAddress(account)}</span>
                </span>
              </div>
              <button onClick={onDisconnect} className="disconnect-button">
                Disconnect
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="clearpath-main">
        {networkError ? (
          <div className="network-error-message" role="alert">
            <div className="error-icon" aria-hidden="true">⚠️</div>
            <h2>Network Mismatch</h2>
            <p>{networkError}</p>
            <p className="error-help">Please switch to the correct network to continue.</p>
          </div>
        ) : (
          <Dashboard provider={provider} signer={signer} account={account} />
        )}
      </main>

      <footer className="clearpath-footer">
        <p>ClearPath: Institutional-Grade Governance Through Prediction Markets</p>
      </footer>
    </div>
  )
}

export default ClearPathApp
