import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useWallet } from '../hooks'
import { useModal } from '../hooks/useUI'
import { useUserPreferences } from '../hooks/useUserPreferences'
import UserManagementModal from './ui/UserManagementModal'
import TokenMintButton from './TokenMintButton'
import walletIcon from '../assets/wallet_icon.svg'
import './Header.css'

function Header({ showClearPathBranding = false, hideWalletButton = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isConnected, address } = useWallet()
  const { showModal } = useModal()
  const { preferences } = useUserPreferences()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [logoError, setLogoError] = useState(false)

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const closeMenu = () => {
    setIsMenuOpen(false)
  }

  const scrollToSection = (sectionId) => {
    closeMenu()
    
    // If we're on the landing page, scroll to section
    if (location.pathname === '/') {
      const element = document.getElementById(sectionId)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' })
      }
    } else {
      // Navigate to landing page with hash
      navigate(`/#${sectionId}`)
    }
  }

  const handleLogoError = () => {
    setLogoError(true)
  }

  const handleOpenUserManagement = () => {
    showModal(<UserManagementModal />, {
      title: 'User Management',
      size: 'large',
      closable: true
    })
  }

  // Shorten wallet address for display
  const shortenAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  return (
    <header className="site-header" role="banner">
      <div className="header-container">
        {/* Logo Section */}
        <div className="header-logo" onClick={() => navigate('/')}>
          {!logoError ? (
            <img 
              src={showClearPathBranding ? "/logo_clearpath.svg" : "/assets/fairwins_no-text_logo.svg"} 
              alt={showClearPathBranding ? "ClearPath" : "FairWins"} 
              className="header-logo-image"
              width="48"
              height="48"
              onError={handleLogoError}
            />
          ) : (
            <span className="header-logo-text">
              {showClearPathBranding ? 'ClearPath' : 'FairWins'}
            </span>
          )}
        </div>

        {/* Desktop Navigation */}
        <nav className="header-nav desktop-nav" aria-label="Main navigation">
          <button onClick={() => scrollToSection('how-it-works')} className="nav-link nav-button">
            How It Works
          </button>
          <button onClick={() => scrollToSection('features')} className="nav-link nav-button">
            Features
          </button>
          <button onClick={() => scrollToSection('use-cases')} className="nav-link nav-button">
            Use Cases
          </button>
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
              <TokenMintButton />
              <button
                className={`wallet-btn ${isConnected ? 'connected' : ''}`}
                onClick={handleOpenUserManagement}
                aria-label={isConnected ? `Wallet connected: ${shortenAddress(address)}` : "Connect wallet"}
                title={isConnected ? `Wallet: ${shortenAddress(address)}` : "Connect Wallet"}
              >
                <img 
                  src={walletIcon} 
                  alt="Wallet" 
                  className="wallet-icon-img"
                  aria-hidden="true"
                />
                {isConnected && (
                  <span className="wallet-address-badge">
                    {shortenAddress(address)}
                  </span>
                )}
                {isConnected && preferences.clearPathStatus.active && (
                  <span className="clearpath-indicator" aria-label="ClearPath Active">✓</span>
                )}
              </button>
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
        <button onClick={() => scrollToSection('how-it-works')} className="mobile-nav-link">
          How It Works
        </button>
        <button onClick={() => scrollToSection('features')} className="mobile-nav-link">
          Features
        </button>
        <button onClick={() => scrollToSection('use-cases')} className="mobile-nav-link">
          Use Cases
        </button>
        <button 
          onClick={() => {
            navigate('/select')
            closeMenu()
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
