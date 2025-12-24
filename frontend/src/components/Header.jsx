import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeb3, useWallet } from '../hooks/useWeb3'
import './Header.css'

function Header({ showClearPathBranding = false, hideWalletButton = false }) {
  const navigate = useNavigate()
  const { isConnected, account } = useWeb3()
  const { connectWallet, disconnectWallet } = useWallet()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const handleConnectWallet = async () => {
    await connectWallet()
  }

  const handleDisconnect = () => {
    disconnectWallet()
  }

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const truncateAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  return (
    <header className="site-header" role="banner">
      <div className="header-container">
        {/* Logo Section */}
        <div className="header-logo" onClick={() => navigate('/')}>
          <img 
            src={showClearPathBranding ? "/logo_clearpath.svg" : "/logo_fwcp.svg"} 
            alt={showClearPathBranding ? "ClearPath" : "FairWins & ClearPath"} 
            className="header-logo-image"
            onError={(e) => { 
              e.target.style.display = 'none'
              e.target.nextSibling.style.display = 'block'
            }}
          />
          <span className="header-logo-text" style={{display: 'none'}}>
            {showClearPathBranding ? 'ClearPath' : 'Prediction DAO'}
          </span>
        </div>

        {/* Desktop Navigation */}
        <nav className="header-nav desktop-nav" aria-label="Main navigation">
          <a href="/#how-it-works" className="nav-link">How It Works</a>
          <a href="/#features" className="nav-link">Features</a>
          <a href="/#use-cases" className="nav-link">Use Cases</a>
          <button 
            onClick={() => navigate('/select')} 
            className="nav-link nav-button"
          >
            Platforms
          </button>
        </nav>

        {/* Wallet Connection Section */}
        <div className="header-actions">
          {!hideWalletButton && (
            <>
              {!isConnected ? (
                <button 
                  onClick={handleConnectWallet}
                  className="connect-wallet-button"
                  aria-label="Connect your crypto wallet"
                >
                  <span className="button-icon">🔗</span>
                  Connect Wallet
                </button>
              ) : (
                <div className="wallet-connected">
                  <span className="wallet-address" aria-label={`Connected wallet: ${account}`}>
                    {truncateAddress(account)}
                  </span>
                  <button 
                    onClick={handleDisconnect}
                    className="disconnect-button"
                    aria-label="Disconnect wallet"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </>
          )}

          {/* Mobile Menu Toggle */}
          <button 
            className="mobile-menu-toggle"
            onClick={toggleMenu}
            aria-label="Toggle navigation menu"
            aria-expanded={isMenuOpen}
          >
            <span className={`hamburger ${isMenuOpen ? 'open' : ''}`}>
              <span></span>
              <span></span>
              <span></span>
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      <nav 
        className={`mobile-nav ${isMenuOpen ? 'open' : ''}`}
        aria-label="Mobile navigation"
      >
        <a href="/#how-it-works" className="mobile-nav-link">How It Works</a>
        <a href="/#features" className="mobile-nav-link">Features</a>
        <a href="/#use-cases" className="mobile-nav-link">Use Cases</a>
        <button 
          onClick={() => {
            navigate('/select')
            setIsMenuOpen(false)
          }} 
          className="mobile-nav-link"
        >
          Platforms
        </button>
      </nav>
    </header>
  )
}

export default Header
