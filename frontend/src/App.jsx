//core
import { useLocation, useNavigate } from 'react-router-dom'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import './theme.css'
import './App.css'
import { useEffect } from 'react'

//system hooks & effects
import { useWallet, useWalletConnection, useWalletNetwork } from './hooks'
import { useAnnouncement, useNotification } from './hooks/useUI'
import { useTheme } from './hooks/useTheme'
import NotificationSystem from './components/ui/NotificationSystem'
import ModalSystem from './components/ui/ModalSystem'
import AnnouncementRegion from './components/ui/AnnouncementRegion'

// Main flow
import LandingPage from './components/LandingPage'
import FairWinsAppNew from './components/fairwins/FairWinsAppNew'

// add-ons
import RolePurchaseScreen from './components/RolePurchaseScreen'
import TokenMintPage from './pages/TokenMintPage'
import MarketPage from './pages/MarketPage'
import CorrelatedMarketsPage from './pages/CorrelatedMarketsPage'
import WalletPage from './pages/WalletPage'


//admin 
import RoleManagementAdmin from './components/RoleManagementAdmin'

// dev
import DevelopmentWarningBanner from './components/ui/DevelopmentWarningBanner'
import DevelopmentWarningModal from './components/ui/DevelopmentWarningModal'
import StateManagementDemo from './components/StateManagementDemo'
import { ComponentExamples } from './components/ui'

//potential removal
import PlatformSelector from './components/PlatformSelector'
import ClearPathApp from './components/ClearPathApp'


function AppContent() {
  const { isConnected } = useWallet()
  const { connectWallet, disconnectWallet } = useWalletConnection()
  const { networkError, switchNetwork } = useWalletNetwork()
  const { announce } = useAnnouncement()
  const { showNotification } = useNotification()
  const { setThemePlatform } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()

  // Auto-detect platform based on route
  useEffect(() => {
    if (location.pathname.includes('/clearpath')) {
      setThemePlatform('clearpath')
    } else {
      // All other routes use FairWins theme (this is fairwins.app)
      setThemePlatform('fairwins')
    }
  }, [location.pathname, setThemePlatform])

  const handleConnect = async () => {
    const success = await connectWallet()
    if (success) {
      announce('Wallet connected successfully')
      showNotification('Wallet connected successfully', 'success')
    } else {
      announce('Wallet connection failed')
      showNotification('Failed to connect wallet. Please try again.', 'error')
    }
    return success
  }

  const handleDisconnect = () => {
    disconnectWallet()
    announce('Wallet disconnected')
    showNotification('Wallet disconnected', 'info')
  }

  const handleSwitchNetwork = async () => {
    await switchNetwork()
    announce('Attempting to switch network')
    showNotification('Switching network...', 'info')
  }

  const handleBack = () => {
    navigate('/')
  }

  return (
    <>
      {/* Development warning banner - always visible */}
      <DevelopmentWarningBanner />
      
      {/* Development warning modal - shows once per session */}
      <DevelopmentWarningModal />
      
      {/* Accessibility announcement region */}
      <AnnouncementRegion />
      
      {/* Notification system */}
      <NotificationSystem />
      
      {/* Modal system */}
      <ModalSystem />

      {/* Network error banner */}
      {networkError && isConnected && (
        <div 
          className="network-error-banner" 
          role="alert"
          aria-live="assertive"
        >
          <span>{networkError}</span>
          <button 
            onClick={handleSwitchNetwork}
            className="switch-network-button"
            aria-label="Switch to correct network"
          >
            Switch Network
          </button>
        </div>
      )}

      <Routes>
        <Route 
          path="/" 
          element={<LandingPage />} 
        />
        <Route 
          path="/select" 
          element={<PlatformSelector />} 
        />
        <Route path="/ui-components" element={<ComponentExamples />} />
        <Route path="/state-demo" element={<StateManagementDemo />} />
        <Route 
          path="/clearpath" 
          element={
            <ClearPathApp 
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onBack={handleBack}
            />
          } 
        />
        <Route 
          path="/app" 
          element={
            <FairWinsAppNew 
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          } 
        />
        <Route 
          path="/main" 
          element={
            <FairWinsAppNew 
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          } 
        />
        <Route 
          path="/fairwins" 
          element={
            <FairWinsAppNew 
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          } 
        />
        
        {/* New page routes for modals converted to pages */}
        <Route path="/market/:id" element={<MarketPage />} />
        <Route path="/markets/correlated/:groupId" element={<CorrelatedMarketsPage />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/tokenmint" element={<TokenMintPage />} />

        <Route path="/admin/roles" element={<RoleManagementAdmin />} />
        <Route path="/purchase-roles" element={<RolePurchaseScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  )
}

export default App
