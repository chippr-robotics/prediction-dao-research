import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import './App.css'
import PlatformSelector from './components/PlatformSelector'
import ClearPathApp from './components/ClearPathApp'
import FairWinsApp from './components/FairWinsApp'

function App() {
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [account, setAccount] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [connected, setConnected] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState(null) // 'clearpath' or 'fairwins'

  const handlePlatformSelect = async (platform) => {
    setSelectedPlatform(platform)
    // Connect wallet after platform selection
    await connectWallet()
  }

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert('Please install MetaMask to use this application')
        return
      }

      const provider = new ethers.BrowserProvider(window.ethereum)
      await provider.send("eth_requestAccounts", [])
      
      const signer = await provider.getSigner()
      const address = await signer.getAddress()
      const network = await provider.getNetwork()

      setProvider(provider)
      setSigner(signer)
      setAccount(address)
      setChainId(network.chainId)
      setConnected(true)

      // Listen for account changes
      if (!window.ethereum._events || !window.ethereum._events.accountsChanged) {
        window.ethereum.on('accountsChanged', handleAccountsChanged)
        window.ethereum.on('chainChanged', () => window.location.reload())
      }
    } catch (error) {
      console.error('Error connecting wallet:', error)
      alert('Failed to connect wallet')
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
    setSelectedPlatform(null)
  }

  const handleBackToPlatformSelection = () => {
    setSelectedPlatform(null)
  }

  // Show platform selector if no platform is selected
  if (!selectedPlatform) {
    return <PlatformSelector onSelectPlatform={handlePlatformSelect} />
  }

  // Show selected platform app if connected
  if (connected && selectedPlatform === 'clearpath') {
    return (
      <ClearPathApp 
        provider={provider}
        signer={signer}
        account={account}
        onDisconnect={disconnectWallet}
        onBack={handleBackToPlatformSelection}
      />
    )
  }

  if (connected && selectedPlatform === 'fairwins') {
    return (
      <FairWinsApp 
        provider={provider}
        signer={signer}
        account={account}
        onDisconnect={disconnectWallet}
        onBack={handleBackToPlatformSelection}
      />
    )
  }

  // Loading state while connecting
  return (
    <div className="App loading-screen">
      <div className="loading-content">
        <h2>Connecting Wallet...</h2>
        <p>Please confirm the connection in your wallet</p>
      </div>
    </div>
  )
}

export default App
