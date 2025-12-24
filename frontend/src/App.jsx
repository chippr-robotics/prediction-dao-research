import { useNavigate } from 'react-router-dom'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import LandingPage from './components/LandingPage'
import PlatformSelector from './components/PlatformSelector'
import ClearPathApp from './components/ClearPathApp'
import FairWinsApp from './components/FairWinsApp'
import { ComponentExamples } from './components/ui'
import { useWeb3, useWallet, useNetwork } from './hooks/useWeb3'
import { useAnnouncement } from './hooks/useUI'
import NotificationSystem from './components/ui/NotificationSystem'
import ModalSystem from './components/ui/ModalSystem'
import AnnouncementRegion from './components/ui/AnnouncementRegion'

function AppContent() {
  const { isConnected } = useWeb3()
  const { connectWallet, disconnectWallet } = useWallet()
  const { networkError, switchNetwork } = useNetwork()
  const { announce } = useAnnouncement()
  const navigate = useNavigate()

  const handleConnect = async () => {
    const success = await connectWallet()
    if (success) {
      announce('Wallet connected successfully')
    } else {
      announce('Wallet connection failed')
    }
    return success
  }

  const handleDisconnect = () => {
    disconnectWallet()
    announce('Wallet disconnected')
  }

  const handleSwitchNetwork = async () => {
    await switchNetwork()
    announce('Network switched')
  }

  const handleBack = () => {
    navigate('/select')
  }

  return (
    <>
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
        <Route path="/" element={<LandingPage />} />
        <Route path="/select" element={<PlatformSelector onConnect={handleConnect} />} />
        <Route path="/ui-components" element={<ComponentExamples />} />
        <Route 
          path="/clearpath" 
          element={
            isConnected ? (
              <ClearPathApp 
                onDisconnect={handleDisconnect}
                onBack={handleBack}
              />
            ) : (
              <Navigate to="/select" replace />
            )
          } 
        />
        <Route 
          path="/fairwins" 
          element={
            isConnected ? (
              <FairWinsApp 
                onDisconnect={handleDisconnect}
                onBack={handleBack}
              />
            ) : (
              <Navigate to="/select" replace />
            )
          } 
        />
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
