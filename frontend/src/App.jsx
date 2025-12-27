import { useLocation, useNavigate } from 'react-router-dom'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import './theme.css'
import './App.css'
import LandingPage from './components/LandingPage'
import PlatformSelector from './components/PlatformSelector'
import ClearPathApp from './components/ClearPathApp'
import FairWinsApp from './components/FairWinsApp'
import FairWinsAppNew from './components/fairwins/FairWinsAppNew'
import StateManagementDemo from './components/StateManagementDemo'
import RoleManagementAdmin from './components/RoleManagementAdmin'
import RolePurchaseScreen from './components/RolePurchaseScreen'
import { ComponentExamples } from './components/ui'
import { useWallet, useWalletConnection, useWalletNetwork } from './hooks'
import { useAnnouncement, useNotification } from './hooks/useUI'
import { useTheme } from './hooks/useTheme'
import { useEffect } from 'react'
import NotificationSystem from './components/ui/NotificationSystem'
import ModalSystem from './components/ui/ModalSystem'
import AnnouncementRegion from './components/ui/AnnouncementRegion'
import DevelopmentWarningBanner from './components/ui/DevelopmentWarningBanner'
import DevelopmentWarningModal from './components/ui/DevelopmentWarningModal'

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
        <Route 
          path="/fairwins-old" 
          element={
            <FairWinsApp 
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          } 
        />
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
