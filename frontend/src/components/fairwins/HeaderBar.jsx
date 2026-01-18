import { useScrollDirection, useScrollPast } from '../../hooks/useScrollDirection'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useWallet } from '../../hooks'
import { useNavigate } from 'react-router-dom'
import BlockiesAvatar from '../ui/BlockiesAvatar'
import TokenMintButton from '../TokenMintButton'
import ClearPathButton from '../clearpath/ClearPathButton'
import WalletButton from '../wallet/WalletButton'
import './HeaderBar.css'

function HeaderBar() {
  const { isScrollingDown } = useScrollDirection(10)
  const hasScrolled = useScrollPast(50)
  const isMobile = useIsMobile()
  useUserPreferences() // Hook called for context subscription
  useWallet() // Hook called for wallet context

  // Hide header on mobile when scrolling down
  const shouldHideHeader = isMobile && isScrollingDown && hasScrolled

  return (
    <header className={`header-bar ${shouldHideHeader ? 'header-hidden' : ''} ${hasScrolled ? 'header-scrolled' : ''}`}>
      <div className="header-bar-content">
        <div className="header-left">
          <div className="header-branding">
            <div className="brand-logo">
              <img 
                src="/assets/logo_fairwins.svg" 
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
          <WalletButton />
          <TokenMintButton />
          <ClearPathButton />
        </div>
      </div>
    </header>
  )
}

export default HeaderBar
