import { useState } from 'react'
import './ClearPathApp.css'
import Dashboard from './Dashboard'

function ClearPathApp({ provider, signer, account, onDisconnect, onBack }) {
  const shortenAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  return (
    <div className="clearpath-app">
      <header className="clearpath-header">
        <div className="header-content">
          <div className="header-left">
            <button onClick={onBack} className="back-button" title="Back to platform selection">
              ← Back
            </button>
            <div className="branding">
              <h1>ClearPath</h1>
              <p className="subtitle">DAO Governance Platform</p>
            </div>
          </div>
          
          <div className="wallet-section">
            <div className="connected-wallet">
              <div className="wallet-info">
                <span className="wallet-address">{shortenAddress(account)}</span>
              </div>
              <button onClick={onDisconnect} className="disconnect-button">
                Disconnect
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="clearpath-main">
        <Dashboard provider={provider} signer={signer} account={account} />
      </main>

      <footer className="clearpath-footer">
        <p>ClearPath: Institutional-Grade Governance Through Prediction Markets</p>
      </footer>
    </div>
  )
}

export default ClearPathApp
