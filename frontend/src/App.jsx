//core
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import './theme.css'
import './App.css'

//system hooks & effects
import { useWallet, useWalletNetwork } from './hooks'
import { useAnnouncement, useNotification } from './hooks/useUI'
import NotificationSystem from './components/ui/NotificationSystem'
import ModalSystem from './components/ui/ModalSystem'
import AnnouncementRegion from './components/ui/AnnouncementRegion'

// Main flow
import LandingRoute from './components/LandingRoute'
import HomeScreen from './components/fairwins/HomeScreen'
import { WAGERS_PATH } from './config/appNav'
import Header from './components/Header'
import Footer from './components/Footer'

// add-ons
import WalletPage from './pages/WalletPage'
import VouchersPage from './pages/VouchersPage'
import MarketAcceptancePage from './pages/MarketAcceptancePage'
import PoolPage from './pages/PoolPage'
import MiniAppWorkspace from './components/miniapps/MiniAppWorkspace'
import { TermsPage, RiskPage, PrivacyPage } from './pages/legal/LegalDocPage'
import EntryGate from './components/compliance/EntryGate'
import AutoConnectPrompt from './components/wallet/AutoConnectPrompt'
import { ActivityProvider } from './contexts/ActivityProvider.jsx'
import { NavDrawerProvider } from './contexts/NavDrawerContext.jsx'
import ActivityNotificationBridge from './components/notifications/ActivityNotificationBridge'
import AppNavDrawer from './components/nav/AppNavDrawer'
import AttentionFocus from './components/nav/AttentionFocus'

//admin
import AdminPanel from './components/AdminPanel'

// dev
import DevelopmentWarningBanner from './components/ui/DevelopmentWarningBanner'
import StagingBanner from './components/ui/StagingBanner'
import StateManagementDemo from './components/StateManagementDemo'
import { ComponentExamples } from './components/ui'
import PwaInstallPrompt from './components/pwa/PwaInstallPrompt'
import PwaUpdateNotification from './components/pwa/PwaUpdateNotification'

function AppLayout() {
  // The global nav drawer ("us") already carries the legal/policy footer, so the
  // page-level footer is redundant on the dense hosts: the My Account screen
  // (/wallet) and the create-a-challenge home (/app, /main, /fairwins), where it
  // also pushed the ticker off the bottom of the view. Every other in-app route
  // keeps it.
  const { pathname } = useLocation()
  const HIDE_PAGE_FOOTER = ['/wallet', '/app', '/main', '/fairwins']
  const showPageFooter = !HIDE_PAGE_FOOTER.includes(pathname)

  return (
    /* Spec 031: platform-wide activity watcher scoped to the app-mode tree — the header bell and the views
       below consume it (wagers + DAO/token/membership sources); landing pages never poll. */
    <ActivityProvider>
      {/* App navigation redesign: the section menu ("us") is now a global left
          drawer opened by the clover logo, shared across every in-app route. */}
      <NavDrawerProvider>
        {/* `app-shell` reserves room for AppNavDrawer's persistent desktop icon
            gutter (see AppNavDrawer.css) — the drawer itself is fixed-position
            and ignores this padding, but everything below needs to clear it. */}
        <div className="app-shell">
          <Header appMode />
          <AppNavDrawer />
          {/* A menu-search result deep-links with `?focus=<id>`; this briefly highlights whatever
              carries the matching `data-attention` marker, so the member can see the thing they
              searched for on a screen they may never have opened before. */}
          <AttentionFocus />
          {/* Spec 086: no operating-as banner for ANY acting account kind — the header wallet
              avatar renders the acting identity, and every kind is treated equally. Switching
              back lives in the account switcher, where switching always lived. */}
          {/* Spec 041: route a tapped push notification into in-app navigation. */}
          <ActivityNotificationBridge />
          {/* Spec 007 (US4): client-side eligibility notice gate before any app content. */}
          <EntryGate />
          {/* Entering the app with no account opens the unlock dialog by itself —
              every surface below is inert until one is connected. */}
          <AutoConnectPrompt />
          <Outlet />
          {/* Spec 010 (US2): condensed legal/policy footer inside the app. The menu
              drawer carries its own copy; /wallet relies on that to avoid duplication. */}
          {showPageFooter && <Footer variant="condensed" />}
        </div>
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
      {/* Non-production marker (spec 076, FR-025/FR-026d). Renders nothing in production;
          on the mainnet staging service it is also the real-funds disclosure. */}
      <StagingBanner />

      {/* Development warning banner - always visible */}
      <DevelopmentWarningBanner />

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
          element={<LandingRoute />}
        />
        <Route path="/ui-components" element={<ComponentExamples />} />
        <Route path="/state-demo" element={<StateManagementDemo />} />

        {/* Public versioned legal documents (Spec 007) — readable before the entry gate */}
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/risk" element={<RiskPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />

        {/* App routes with header + wallet button */}
        <Route element={<AppLayout />}>
          <Route path="/app" element={<HomeScreen />} />
          <Route path="/main" element={<HomeScreen />} />
          <Route path="/fairwins" element={<HomeScreen />} />
          {/* Wagers moved into Finance ▸ Transfer (spec 073) — it sits beside Transfer and
              Bridge because all three are ways money leaves this section. `/wagers` stays a
              live route rather than being deleted: it is on printed cards, saved links and
              bookmarks, and a redirect costs nothing where a 404 costs a member their way in.
              `replace` so Back returns where they came from instead of bouncing off it. */}
          <Route path="/wagers" element={<Navigate to={WAGERS_PATH} replace />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/vouchers" element={<VouchersPage />} />
          <Route path="/friend-market/accept" element={<MarketAcceptancePage />} />
          <Route path="/pools/:address" element={<PoolPage />} />
          {/* Spec 073: one mini-app workspace per registry listing. The slug is
              derived from the listing's on-chain (unique) name, and the workspace
              re-reads that record from the chain on every launch — a catalog card
              is never what decides that something may run. */}
          <Route path="/apps/:slug" element={<MiniAppWorkspace />} />
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
