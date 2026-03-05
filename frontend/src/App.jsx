//core
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import './theme.css'
import './App.css'

//system hooks & effects
import { useWallet, useWalletConnection, useWalletNetwork } from './hooks'
import { useAnnouncement, useNotification } from './hooks/useUI'
import NotificationSystem from './components/ui/NotificationSystem'
import ModalSystem from './components/ui/ModalSystem'
import AnnouncementRegion from './components/ui/AnnouncementRegion'

// Main flow
import LandingPage from './components/LandingPage'
import FairWinsAppNew from './components/fairwins/FairWinsAppNew'

// add-ons
import WalletPage from './pages/WalletPage'
import MarketAcceptancePage from './pages/MarketAcceptancePage'

//admin
import RoleManagementAdmin from './components/RoleManagementAdmin'
import AdminPanel from './components/AdminPanel'

// dev
import DevelopmentWarningBanner from './components/ui/DevelopmentWarningBanner'
import DevelopmentWarningModal from './components/ui/DevelopmentWarningModal'
import StateManagementDemo from './components/StateManagementDemo'
import { ComponentExamples } from './components/ui'


function AppContent() {
  const { isConnected } = useWallet()
  const { connectWallet, disconnectWallet } = useWalletConnection()
  const { networkError, switchNetwork } = useWalletNetwork()
  const { announce } = useAnnouncement()
  const { showNotification } = useNotification()

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
        <Route path="/ui-components" element={<ComponentExamples />} />
        <Route path="/state-demo" element={<StateManagementDemo />} />
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

        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/friend-market/accept" element={<MarketAcceptancePage />} />

        {/* Admin routes - restricted to users with admin roles */}
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/admin/roles" element={<RoleManagementAdmin />} />
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
