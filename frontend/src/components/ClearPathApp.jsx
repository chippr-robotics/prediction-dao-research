import './ClearPathApp.css'
import Dashboard from './Dashboard'
import RoleGate from './ui/RoleGate'
import PremiumPurchaseModal from './ui/PremiumPurchaseModal'
import BlockiesAvatar from './ui/BlockiesAvatar'
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
    showModal(<PremiumPurchaseModal onClose={() => showModal(null)} />, {
      title: '',
      size: 'large',
      closable: false
    })
  }

  return (
    <div className="clearpath-app">
      {/* Skip to main content link for keyboard navigation */}
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      
      <header className="clearpath-header">
        <div className="clearpath-header-content">
          <div className="clearpath-header-left">
            <button 
              onClick={onBack} 
              className="clearpath-back-button" 
              aria-label="Back to platform selection"
            >
              ← Back
            </button>
            <div className="clearpath-branding">
              <div className="clearpath-brand-logo">
                <img 
                  src="/logo_clearpath.svg" 
                  alt="ClearPath Logo" 
                  className="logo-image"
                  width="40"
                  height="40"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
              </div>
              <div className="clearpath-brand-text">
                <h1>ClearPath</h1>
                <p className="subtitle">DAO Governance Platform</p>
              </div>
            </div>
          </div>
          
          <div className="clearpath-wallet-section">
            {isConnected ? (
              <div className="clearpath-connected-wallet">
                <div className="clearpath-wallet-info">
                  <span className="clearpath-connection-status" aria-label="Wallet connected">
                    <BlockiesAvatar address={account} size={24} className="wallet-avatar-inline" />
                    <span className="clearpath-wallet-address">{shortenAddress(account)}</span>
                  </span>
                </div>
                <button 
                  onClick={onDisconnect} 
                  className="clearpath-disconnect-button"
                  aria-label="Disconnect wallet"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button 
                onClick={handleConnectClick} 
                className="clearpath-connect-button"
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
