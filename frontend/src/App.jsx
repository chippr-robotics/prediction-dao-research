//core
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import './theme.css'
import './App.css'

//system hooks & effects
import { useWallet, useWalletNetwork } from './hooks'
import { useAnnouncement, useNotification } from './hooks/useUI'
import NotificationSystem from './components/ui/NotificationSystem'
import ModalSystem from './components/ui/ModalSystem'
import AnnouncementRegion from './components/ui/AnnouncementRegion'

// Main flow
import LandingPage from './components/LandingPage'
import Dashboard from './components/fairwins/Dashboard'

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
  const { networkError, switchNetwork } = useWalletNetwork()
  const { announce } = useAnnouncement()
  const { showNotification } = useNotification()

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
        <Route path="/app" element={<Dashboard />} />
        <Route path="/main" element={<Dashboard />} />
        <Route path="/fairwins" element={<Dashboard />} />

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
