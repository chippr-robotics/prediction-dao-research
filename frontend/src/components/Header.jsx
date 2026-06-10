import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import WalletButton from './wallet/WalletButton'
import ThemeToggle from './ui/ThemeToggle'
import NotificationBell from './notifications/NotificationBell'
import './Header.css'

function Header({ hideWalletButton = false, appMode = false }) {
  const navigate = useNavigate()
  const location = useLocation()
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

    if (location.pathname === '/') {
      const element = document.getElementById(sectionId)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' })
      }
    } else {
      navigate(`/#${sectionId}`)
    }
  }

  const handleLogoError = () => {
    setLogoError(true)
  }

  return (
    <header className="site-header" role="banner">
      <div className="header-container">
        {/* Logo Section */}
        <div className="header-logo" onClick={() => navigate(appMode ? '/app' : '/')}>
          {!logoError ? (
            <img
              src="/assets/fairwins_no-text_logo.svg"
              alt="FairWins"
              className="header-logo-image"
              width="48"
              height="48"
              onError={handleLogoError}
            />
          ) : (
            <span className="header-logo-text">FairWins</span>
          )}
        </div>

        {/* Desktop Navigation */}
        <nav className="header-nav desktop-nav" aria-label="Main navigation">
          {appMode ? (
            <>
              <button
                onClick={() => navigate('/app')}
                className={`nav-link nav-button ${location.pathname === '/app' || location.pathname === '/main' || location.pathname === '/fairwins' ? 'active' : ''}`}
              >
                Dashboard
              </button>
              <button
                onClick={() => navigate('/wallet')}
                className={`nav-link nav-button ${location.pathname === '/wallet' ? 'active' : ''}`}
              >
                My Account
              </button>
            </>
          ) : (
            <>
              <button onClick={() => scrollToSection('features')} className="nav-link nav-button">
                Why P2P
              </button>
              <button onClick={() => scrollToSection('how-it-works')} className="nav-link nav-button">
                How It Works
              </button>
              <button onClick={() => scrollToSection('use-cases')} className="nav-link nav-button">
                Use Cases
              </button>
              <button
                onClick={() => navigate('/app')}
                className="nav-link nav-button"
              >
                Launch App
              </button>
            </>
          )}
        </nav>

        {/* Wallet Connection Section */}
        <div className="header-actions">
          {appMode && <ThemeToggle />}
          {/* Spec 012: single unread indicator — renders null when
              disconnected or outside the WagerActivityProvider. */}
          {appMode && <NotificationBell />}
          {!hideWalletButton && (
            <WalletButton
                theme="dark"
              />
          )}

          {/* Mobile Menu Toggle - landing page only; app mode uses wallet menu for nav */}
          {!appMode && (
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
          )}
        </div>
      </div>

      {/* Mobile Navigation - landing page only */}
      {!appMode && (
        <nav
          className={`mobile-nav ${isMenuOpen ? 'open' : ''}`}
          aria-label="Mobile navigation"
        >
          <button onClick={() => scrollToSection('features')} className="mobile-nav-link">
            Why P2P
          </button>
          <button onClick={() => scrollToSection('how-it-works')} className="mobile-nav-link">
            How It Works
          </button>
          <button onClick={() => scrollToSection('use-cases')} className="mobile-nav-link">
            Use Cases
          </button>
          <button
            onClick={() => {
              navigate('/app')
              closeMenu()
            }}
            className="mobile-nav-link"
          >
            Launch App
          </button>
        </nav>
      )}
    </header>
  )
}

export default Header
