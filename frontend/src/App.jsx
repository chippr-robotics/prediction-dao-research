import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi'
import { ethers } from 'ethers'
import './App.css'
import LandingPage from './components/LandingPage'
import PlatformSelector from './components/PlatformSelector'
import ClearPathApp from './components/ClearPathApp'
import FairWinsApp from './components/FairWinsApp'
import { ComponentExamples } from './components/ui'
import { EXPECTED_CHAIN_ID, getExpectedChain } from './wagmi'

function AppContent() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const navigate = useNavigate()
  
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [networkError, setNetworkError] = useState(null)
  const [announcement, setAnnouncement] = useState('')

  // Update provider and signer when connection changes
  useEffect(() => {
    const updateProviderAndSigner = async () => {
      if (isConnected && window.ethereum) {
        try {
          const ethersProvider = new ethers.BrowserProvider(window.ethereum)
          const ethersSigner = await ethersProvider.getSigner()
          setProvider(ethersProvider)
          setSigner(ethersSigner)
        } catch (error) {
          console.error('Error creating provider/signer:', error)
        }
      } else {
        setProvider(null)
        setSigner(null)
      }
    }
    
    updateProviderAndSigner()
  }, [isConnected, address])

  // Check network compatibility
  useEffect(() => {
    if (isConnected && chainId !== EXPECTED_CHAIN_ID) {
      const expectedChain = getExpectedChain()
      setNetworkError(`Wrong network. Please switch to ${expectedChain.name} (Chain ID: ${EXPECTED_CHAIN_ID})`)
      setAnnouncement(`Network error: Connected to wrong network. Please switch to ${expectedChain.name}`)
    } else {
      setNetworkError(null)
    }
  }, [chainId, isConnected])

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert('Please install MetaMask to use this application')
        setAnnouncement('Wallet connection failed: MetaMask not installed')
        return false
      }

      const connector = connectors.find(c => c.id === 'injected')
      if (!connector) {
        alert('No wallet connector available')
        setAnnouncement('Wallet connection failed: No connector available')
        return false
      }

      await connect({ connector })
      setAnnouncement('Wallet connected successfully')
      return true
    } catch (error) {
      console.error('Error connecting wallet:', error)
      
      // Check for user rejection via error code or name
      if (error.code === 4001 || error.name === 'UserRejectedRequestError') {
        alert('Please approve the connection request')
        setAnnouncement('Connection rejected by user')
      } else {
        alert('Failed to connect wallet')
        setAnnouncement('Wallet connection failed')
      }
      return false
    }
  }

  const disconnectWallet = () => {
    disconnect()
    setAnnouncement('Wallet disconnected')
  }

  const handleSwitchNetwork = async () => {
    try {
      await switchChain({ chainId: EXPECTED_CHAIN_ID })
      setAnnouncement('Network switched successfully')
    } catch (error) {
      console.error('Error switching network:', error)
      setAnnouncement('Failed to switch network')
      
      // If switching failed, show instructions
      alert(`Please manually switch to the correct network in MetaMask:\nNetwork: ${getExpectedChain().name}\nChain ID: ${EXPECTED_CHAIN_ID}`)
    }
  }

  const handleBack = () => {
    navigate('/select')
  }

  return (
    <>
      {/* Screen reader announcements */}
      <div 
        role="status" 
        aria-live="polite" 
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

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
        <Route path="/select" element={<PlatformSelector onConnect={connectWallet} />} />
        <Route path="/ui-components" element={<ComponentExamples />} />
        <Route 
          path="/clearpath" 
          element={
            isConnected ? (
              <ClearPathApp 
                provider={provider}
                signer={signer}
                account={address}
                onDisconnect={disconnectWallet}
                onBack={handleBack}
                networkError={networkError}
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
                account={address}
                onDisconnect={disconnectWallet}
                onBack={handleBack}
                networkError={networkError}
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
