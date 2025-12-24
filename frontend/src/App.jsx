import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { ethers } from 'ethers'
import './App.css'
import LandingPage from './components/LandingPage'
import PlatformSelector from './components/PlatformSelector'
import ClearPathApp from './components/ClearPathApp'
import FairWinsApp from './components/FairWinsApp'

function App() {
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [account, setAccount] = useState(null)
  const [connected, setConnected] = useState(false)

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert('Please install MetaMask to use this application')
        return false
      }

      const provider = new ethers.BrowserProvider(window.ethereum)
      await provider.send("eth_requestAccounts", [])
      
      const signer = await provider.getSigner()
      const address = await signer.getAddress()
      const network = await provider.getNetwork()

      setProvider(provider)
      setSigner(signer)
      setAccount(address)
      setConnected(true)

      // Listen for account changes
      if (!window.ethereum._events || !window.ethereum._events.accountsChanged) {
        window.ethereum.on('accountsChanged', handleAccountsChanged)
        window.ethereum.on('chainChanged', () => window.location.reload())
      }
      
      return true
    } catch (error) {
      console.error('Error connecting wallet:', error)
      if (error.code === 4001) {
        alert('Please approve the connection request')
      } else {
        alert('Failed to connect wallet')
      }
      return false
    }
  }

  const handleAccountsChanged = async (accounts) => {
    if (accounts.length === 0) {
      // User disconnected
      setProvider(null)
      setSigner(null)
      setAccount(null)
      setConnected(false)
    } else {
      // Account changed
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const address = await signer.getAddress()
      
      setProvider(provider)
      setSigner(signer)
      setAccount(address)
    }
  }

  const disconnectWallet = () => {
    setProvider(null)
    setSigner(null)
    setAccount(null)
    setConnected(false)
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/select" element={<PlatformSelector onConnect={connectWallet} />} />
        <Route 
          path="/clearpath" 
          element={
            connected ? (
              <ClearPathApp 
                provider={provider}
                signer={signer}
                account={account}
                onDisconnect={disconnectWallet}
              />
            ) : (
              <Navigate to="/select" replace />
            )
          } 
        />
        <Route 
          path="/fairwins" 
          element={
            connected ? (
              <FairWinsApp 
                provider={provider}
                signer={signer}
                account={account}
                onDisconnect={disconnectWallet}
              />
            ) : (
              <Navigate to="/select" replace />
            )
          } 
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

export default App
