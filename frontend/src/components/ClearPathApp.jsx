import './ClearPathApp.css'
import Dashboard from './Dashboard'
import RoleGate from './ui/RoleGate'
import RolePurchaseModal from './ui/RolePurchaseModal'
import { useWeb3, useNetwork } from '../hooks/useWeb3'
import { useRoles } from '../hooks/useRoles'
import { useModal } from '../hooks/useUI'

function ClearPathApp({ onConnect, onDisconnect, onBack }) {
  const { account, isConnected } = useWeb3()
  const { networkError } = useNetwork()
  const { ROLES } = useRoles()
  const { showModal } = useModal()

  const shortenAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  const handleConnectClick = async () => {
    await onConnect()
  }

  const handlePurchaseClick = () => {
    showModal(<RolePurchaseModal />, {
      title: '',
      size: 'large',
      closable: true
    })
  }

  return (
    <div className="clearpath-app">
      {/* Skip to main content link for keyboard navigation */}
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      
      <header className="clearpath-header">
        <div className="header-content">
          <div className="header-left">
            <button 
              onClick={onBack} 
              className="back-button" 
              aria-label="Back to platform selection"
            >
              ← Back
            </button>
            <div className="branding">
              <div className="brand-logo">
                <img 
                  src="/logo_clearpath.svg" 
                  alt="ClearPath Logo" 
                  className="logo-image"
                  width="40"
                  height="40"
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
            {isConnected ? (
              <div className="connected-wallet">
                <div className="wallet-info">
                  <span className="connection-status" aria-label="Wallet connected">
                    <span className="status-indicator" aria-hidden="true">●</span>
                    <span className="wallet-address">{shortenAddress(account)}</span>
                  </span>
                </div>
                <button 
                  onClick={onDisconnect} 
                  className="disconnect-button"
                  aria-label="Disconnect wallet"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button 
                onClick={handleConnectClick} 
                className="connect-button"
                aria-label="Connect wallet"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" className="clearpath-main" tabIndex="-1">
        {networkError ? (
          <div className="network-error-message" role="alert">
            <div className="error-icon" aria-hidden="true">⚠️</div>
            <h2>Network Mismatch</h2>
            <p>{networkError}</p>
            <p className="error-help">Please switch to the correct network to continue.</p>
          </div>
        ) : (
          <RoleGate 
            requiredRoles={[ROLES.CLEARPATH_USER]} 
            showPurchase={true}
            onPurchase={handlePurchaseClick}
          >
            <Dashboard />
          </RoleGate>
        )}
      </main>

      <footer className="clearpath-footer">
        <p>ClearPath: Institutional-Grade Governance Through Prediction Markets</p>
      </footer>
    </div>
  )
}

export default ClearPathApp
