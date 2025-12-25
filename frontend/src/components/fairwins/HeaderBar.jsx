import { useScrollDirection, useScrollPast } from '../../hooks/useScrollDirection'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { useModal } from '../../hooks/useUI'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import UserManagementModal from '../ui/UserManagementModal'
import './HeaderBar.css'

function HeaderBar({ isConnected, onScanMarket }) {
  const { isScrollingDown } = useScrollDirection(10)
  const hasScrolled = useScrollPast(50)
  const isMobile = useIsMobile()
  const { showModal } = useModal()
  const { preferences } = useUserPreferences()

  const handleOpenUserManagement = () => {
    showModal(<UserManagementModal onScanMarket={onScanMarket} />, {
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
    </header>
  )
}

export default HeaderBar
