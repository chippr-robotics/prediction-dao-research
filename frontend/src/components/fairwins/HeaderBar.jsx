import { useScrollDirection, useScrollPast } from '../../hooks/useScrollDirection'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { useModal } from '../../hooks/useUI'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useWallet } from '../../hooks'
import UserManagementModal from '../ui/UserManagementModal'
import BlockiesAvatar from '../ui/BlockiesAvatar'
import './HeaderBar.css'

function HeaderBar({ isConnected, onScanMarket }) {
  const { isScrollingDown } = useScrollDirection(10)
  const hasScrolled = useScrollPast(50)
  const isMobile = useIsMobile()
  const { showModal } = useModal()
  const { preferences } = useUserPreferences()
  const { address } = useWallet()

  const handleOpenUserManagement = () => {
    showModal(<UserManagementModal onScanMarket={onScanMarket} />, {
      title: 'User Management',
      size: 'large',
      closable: true
    })
  }

  // Hide header on mobile when scrolling down
  const shouldHideHeader = isMobile && isScrollingDown && hasScrolled

  return (
    <header className={`header-bar ${shouldHideHeader ? 'header-hidden' : ''} ${hasScrolled ? 'header-scrolled' : ''}`}>
      <div className="header-bar-content">
        <div className="header-left">
          <div className="header-branding">
            <div className="brand-logo">
              <img 
                src="/logo_fairwins.svg" 
                alt="FairWins Logo" 
                className="logo-image"
                width="40"
                height="40"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            </div>
            <div className="brand-text">
              <h1>FairWins</h1>
              <p className="tagline">Prediction Markets</p>
            </div>
          </div>
        </div>

        <div className="header-right">
          <button
            className="user-management-btn"
            onClick={handleOpenUserManagement}
            aria-label="Open user management"
            title="User Management"
          >
            <BlockiesAvatar address={address} size={32} className="user-icon" />
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
