import { useState } from 'react'
import { useScrollDirection, useScrollPast } from '../../hooks/useScrollDirection'
import { useIsMobile } from '../../hooks/useMediaQuery'
import QRScanner from '../ui/QRScanner'
import SettingsModal from '../ui/SettingsModal'
import './HeaderBar.css'

function HeaderBar({ onConnect, onDisconnect, onBack, isConnected, account, onScanMarket }) {
  const { isScrollingDown } = useScrollDirection(10)
  const hasScrolled = useScrollPast(50)
  const isMobile = useIsMobile()
  const [showScanner, setShowScanner] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

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

  // Hide header on mobile when scrolling down
  const shouldHideHeader = isMobile && isScrollingDown && hasScrolled

  const shortenAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  return (
    <header className={`header-bar ${shouldHideHeader ? 'header-hidden' : ''} ${hasScrolled ? 'header-scrolled' : ''}`}>
      <div className="header-content">
        <div className="header-left">
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
          
          {isConnected && (
            <div className="wallet-info-compact">
              <span className="status-dot" aria-label="Wallet connected"></span>
              <span className="wallet-address">{shortenAddress(account)}</span>
            </div>
          )}

          <button 
            className="settings-btn"
            onClick={() => setShowSettings(true)}
            aria-label="Open settings"
            title="Settings"
          >
            <span aria-hidden="true">⚙️</span>
            {!isMobile && <span className="btn-text">Settings</span>}
          </button>
        </div>
      </div>

      <QRScanner 
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScanSuccess={handleScanSuccess}
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        isConnected={isConnected}
        account={account}
      />
    </header>
  )
}

export default HeaderBar
