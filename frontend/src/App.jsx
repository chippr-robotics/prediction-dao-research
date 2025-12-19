import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import './App.css'
import ProposalSubmission from './components/ProposalSubmission'
import ProposalList from './components/ProposalList'
import WelfareMetrics from './components/WelfareMetrics'
import MarketTrading from './components/MarketTrading'

function App() {
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [account, setAccount] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    checkConnection()
  }, [])

  const checkConnection = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum)
        const accounts = await provider.listAccounts()
        
        if (accounts.length > 0) {
          await connectWallet()
        }
      } catch (error) {
        console.error('Error checking connection:', error)
      }
    }
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
      window.ethereum.on('accountsChanged', handleAccountsChanged)
      window.ethereum.on('chainChanged', () => window.location.reload())
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
  }

  const shortenAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>ClearPath</h1>
        <p className="subtitle">Institutional-Grade Governance Platform</p>
        
        <div className="wallet-section">
          {!connected ? (
            <button onClick={connectWallet} className="connect-button">
              Connect Wallet
            </button>
          ) : (
            <div className="connected-wallet">
              <div className="wallet-info">
                <span className="wallet-address">{shortenAddress(account)}</span>
                <span className="chain-id">Chain: {chainId?.toString()}</span>
              </div>
              <button onClick={disconnectWallet} className="disconnect-button">
                Disconnect
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="main-content">
        {!connected ? (
          <div className="not-connected">
            <h2>Welcome to ClearPath</h2>
            <p>An enterprise platform for prediction market-based governance integrating:</p>
            <ul>
              <li>Zero-knowledge position encryption for privacy</li>
              <li>Anti-collusion infrastructure for secure voting</li>
              <li>Conditional Token Framework for market mechanics</li>
            </ul>
            <p>Please connect your wallet to continue</p>
          </div>
        ) : (
          <div className="dashboard">
            <div className="section">
              <h2>Welfare Metrics</h2>
              <WelfareMetrics provider={provider} signer={signer} />
            </div>

            <div className="section">
              <h2>Submit Proposal</h2>
              <ProposalSubmission provider={provider} signer={signer} />
            </div>

            <div className="section">
              <h2>Active Proposals</h2>
              <ProposalList provider={provider} signer={signer} />
            </div>

            <div className="section">
              <h2>Prediction Markets</h2>
              <MarketTrading provider={provider} signer={signer} />
            </div>
          </div>
        )}
      </main>

      <footer className="App-footer">
        <p>ClearPath - Enterprise Governance Platform | Privacy-Preserving • Secure • Transparent</p>
      </footer>
    </div>
  )
}

export default App
