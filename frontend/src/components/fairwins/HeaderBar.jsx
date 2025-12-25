import { useState } from 'react'
import { useScrollDirection, useScrollPast } from '../../hooks/useScrollDirection'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { useModal } from '../../hooks/useUI'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import QRScanner from '../ui/QRScanner'
import UserManagementModal from '../ui/UserManagementModal'
import './HeaderBar.css'

function HeaderBar({ onConnect, onDisconnect, onBack, isConnected, account, onScanMarket }) {
  const { isScrollingDown } = useScrollDirection(10)
  const hasScrolled = useScrollPast(50)
  const isMobile = useIsMobile()
  const { showModal } = useModal()
  const { preferences } = useUserPreferences()
  const [showScanner, setShowScanner] = useState(false)

  const shortenAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  const handleConnectClick = async () => {
    if (onConnect) {
      await onConnect()
    }
  }

  const handleScanSuccess = (decodedText, url) => {
    setShowScanner(false)
    
    if (url && url.pathname.includes('/market/')) {
      const marketId = url.pathname.split('/market/')[1]
      if (onScanMarket) {
        onScanMarket(marketId)
      }
    } else {
      // TODO: Replace with proper toast notification system
      alert(`Scanned: ${decodedText}`)
    }
  }

  const handleOpenUserManagement = () => {
    showModal(<UserManagementModal />, {
      title: null,
      size: 'large',
      closable: true
    })
  }

  // Hide header on mobile when scrolling down
  const shouldHideHeader = isMobile && isScrollingDown && hasScrolled

  return (
    <header className={`header-bar ${shouldHideHeader ? 'header-hidden' : ''} ${hasScrolled ? 'header-scrolled' : ''}`}>
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
          <button 
            className="scan-qr-btn"
            onClick={() => setShowScanner(true)}
            aria-label="Scan QR code to open market"
            title="Scan QR Code"
          >
            <span aria-hidden="true">📷</span>
            {!isMobile && <span className="btn-text">Scan</span>}
          </button>
          
          <button
            className="user-management-btn"
            onClick={handleOpenUserManagement}
            aria-label="Open user management"
            title="User Management"
          >
            <span className="user-icon" aria-hidden="true">👤</span>
            {isConnected && preferences.clearPathStatus.active && (
              <span className="clearpath-badge" aria-label="ClearPath Active">✓</span>
            )}
          </button>
        </div>
      </div>

      <QRScanner 
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScanSuccess={handleScanSuccess}
      />
    </header>
  )
}

export default HeaderBar
