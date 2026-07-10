//core
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom'
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
import Header from './components/Header'
import Footer from './components/Footer'

// add-ons
import WalletPage from './pages/WalletPage'
import VouchersPage from './pages/VouchersPage'
import MarketAcceptancePage from './pages/MarketAcceptancePage'
import PoolPage from './pages/PoolPage'
import { TermsPage, RiskPage, PrivacyPage } from './pages/legal/LegalDocPage'
import EntryGate from './components/compliance/EntryGate'
import { ActivityProvider } from './contexts/ActivityProvider.jsx'
import { NavDrawerProvider } from './contexts/NavDrawerContext.jsx'
import ActivityNotificationBridge from './components/notifications/ActivityNotificationBridge'
import OperateAsIndicator from './components/custody/OperateAsIndicator'
import AppNavDrawer from './components/nav/AppNavDrawer'

//admin
import AdminPanel from './components/AdminPanel'

// dev
import DevelopmentWarningBanner from './components/ui/DevelopmentWarningBanner'
import DevelopmentWarningModal from './components/ui/DevelopmentWarningModal'
import StateManagementDemo from './components/StateManagementDemo'
import { ComponentExamples } from './components/ui'
import PwaInstallPrompt from './components/pwa/PwaInstallPrompt'
import PwaUpdateNotification from './components/pwa/PwaUpdateNotification'

function AppLayout() {
  return (
    /* Spec 031: platform-wide activity watcher scoped to the app-mode tree — the header bell and the views
       below consume it (wagers + DAO/token/membership sources); landing pages never poll. */
    <ActivityProvider>
      {/* App navigation redesign: the section menu ("us") is now a global left
          drawer opened by the clover logo, shared across every in-app route. */}
      <NavDrawerProvider>
        <Header appMode />
        <AppNavDrawer />
        {/* Spec 043 (US3): persistent banner while operating as a vault, with switch-back. */}
        <OperateAsIndicator />
        {/* Spec 041: route a tapped push notification into in-app navigation. */}
        <ActivityNotificationBridge />
        {/* Spec 007 (US4): client-side eligibility notice gate before any app content. */}
        <EntryGate />
        <Outlet />
        {/* Spec 010 (US2): condensed legal/policy footer inside the app. The menu
            drawer carries its own copy for when it is open. */}
        <Footer variant="condensed" />
      </NavDrawerProvider>
    </ActivityProvider>
  )
}


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

      {/* PWA install bottom-sheet — shown to non-standalone visitors who haven't opted out */}
      <PwaInstallPrompt />

      {/* PWA update toast — routes to the Software Update section when a new version is ready */}
      <PwaUpdateNotification />

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

        {/* Public versioned legal documents (Spec 007) — readable before the entry gate */}
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/risk" element={<RiskPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />

        {/* App routes with header + wallet button */}
        <Route element={<AppLayout />}>
          <Route path="/app" element={<Dashboard />} />
          <Route path="/main" element={<Dashboard />} />
          <Route path="/fairwins" element={<Dashboard />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/vouchers" element={<VouchersPage />} />
          <Route path="/friend-market/accept" element={<MarketAcceptancePage />} />
          <Route path="/pools/:address" element={<PoolPage />} />
          <Route path="/admin" element={<AdminPanel />} />
        </Route>

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
