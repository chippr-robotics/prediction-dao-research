import { useState, useCallback } from 'react'
import {
  useWeb3,
  useAccount,
  useNetwork,
  useEthers,
  useWallet,
  useNotification,
  useAnnouncement,
  useModal,
  useError,
  useAccountChange,
  useChainChange
} from '../hooks'
import './StateManagementDemo.css'

/**
 * Demo component showcasing all state management features
 * This demonstrates:
 * - Web3 state access via hooks
 * - UI state management (notifications, modals, announcements)
 * - Blockchain event responsiveness
 * - No prop drilling
 */
function StateManagementDemo() {
  const { isConnected } = useWeb3()
  const { account } = useAccount()
  const { chainId, networkError, isCorrectNetwork } = useNetwork()
  const { provider, signer } = useEthers()
  const { connectWallet, disconnectWallet } = useWallet()
  const { showNotification } = useNotification()
  const { announce } = useAnnouncement()
  const { showModal, hideModal } = useModal()
  const { error, showError, clearError } = useError()
  const [eventLog, setEventLog] = useState([])

  // Define addToLog before hooks that use it
  const addToLog = useCallback((message) => {
    setEventLog(prev => [
      { timestamp: new Date().toLocaleTimeString(), message },
      ...prev.slice(0, 9) // Keep last 10 entries
    ])
  }, [])

  // Listen to account changes
  useAccountChange((newAccount) => {
    addToLog('Account changed: ' + newAccount)
  })

  // Listen to chain changes
  useChainChange((newChainId) => {
    addToLog('Chain changed: ' + newChainId)
  })

  const handleConnect = async () => {
    const success = await connectWallet()
    if (success) {
      addToLog('Wallet connected successfully')
    }
  }

  const handleDisconnect = () => {
    disconnectWallet()
    addToLog('Wallet disconnected')
  }

  const demoNotifications = () => {
    showNotification('This is an info notification', 'info')
    announce('Info notification shown')
    addToLog('Showed info notification')
    
    setTimeout(() => {
      showNotification('This is a success notification', 'success')
      announce('Success notification shown')
      addToLog('Showed success notification')
    }, 1000)
    
    setTimeout(() => {
      showNotification('This is a warning notification', 'warning')
      announce('Warning notification shown')
      addToLog('Showed warning notification')
    }, 2000)
  }

  const demoModal = () => {
    showModal(
      <div className="demo-modal-content">
        <p>This is a demo modal with state management.</p>
        <p>Current account: {account || 'Not connected'}</p>
        <p>Chain ID: {chainId || 'Unknown'}</p>
        <div className="modal-actions">
          <button onClick={hideModal} className="primary-button">
            Close Modal
          </button>
        </div>
      </div>,
      {
        title: 'State Management Demo Modal',
        size: 'medium',
        closable: true
      }
    )
    addToLog('Opened demo modal')
    announce('Demo modal opened')
  }

  const demoError = () => {
    showError('This is a demo error message', {
      component: 'StateManagementDemo',
      action: 'demoError',
      timestamp: Date.now()
    })
    addToLog('Showed demo error')
    announce('Error displayed')
  }

  const simulateTransaction = async () => {
    showNotification('Simulating transaction...', 'info', 0)
    announce('Transaction simulation started')
    addToLog('Transaction simulation started')

    // Simulate transaction delay
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Simulate success (80% chance)
    if (Math.random() > 0.2) {
      showNotification('Transaction successful!', 'success')
      announce('Transaction completed successfully')
      addToLog('Transaction simulation completed successfully')
    } else {
      showNotification('Transaction failed!', 'error')
      announce('Transaction failed')
      addToLog('Transaction simulation failed')
    }
  }

  return (
    <div className="demo-container">
      <div className="demo-header">
        <h1>State Management Demo</h1>
        <p>Demonstrating context-based state management without prop drilling</p>
      </div>

      <div className="demo-grid">
        {/* Web3 State Section */}
        <div className="demo-card">
          <h2>Web3 State</h2>
          <div className="state-info">
            <div className="state-item">
              <span className="state-label">Connected:</span>
              <span className={`state-value ${isConnected ? 'connected' : 'disconnected'}`}>
                {isConnected ? '✓ Yes' : '✗ No'}
              </span>
            </div>
            <div className="state-item">
              <span className="state-label">Account:</span>
              <span className="state-value monospace">
                {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'N/A'}
              </span>
            </div>
            <div className="state-item">
              <span className="state-label">Chain ID:</span>
              <span className="state-value">{chainId || 'N/A'}</span>
            </div>
            <div className="state-item">
              <span className="state-label">Network OK:</span>
              <span className={`state-value ${isCorrectNetwork ? 'connected' : 'disconnected'}`}>
                {isCorrectNetwork ? '✓ Yes' : '✗ No'}
              </span>
            </div>
            <div className="state-item">
              <span className="state-label">Provider:</span>
              <span className="state-value">{provider ? '✓ Ready' : '✗ Not Ready'}</span>
            </div>
            <div className="state-item">
              <span className="state-label">Signer:</span>
              <span className="state-value">{signer ? '✓ Ready' : '✗ Not Ready'}</span>
            </div>
          </div>
          <div className="demo-actions">
            {!isConnected ? (
              <button onClick={handleConnect} className="primary-button">
                Connect Wallet
              </button>
            ) : (
              <button onClick={handleDisconnect} className="secondary-button">
                Disconnect Wallet
              </button>
            )}
          </div>
        </div>

        {/* UI Actions Section */}
        <div className="demo-card">
          <h2>UI State Actions</h2>
          <div className="demo-actions-grid">
            <button onClick={demoNotifications} className="action-button">
              Show Notifications
            </button>
            <button onClick={demoModal} className="action-button">
              Open Modal
            </button>
            <button onClick={demoError} className="action-button">
              Show Error
            </button>
            <button 
              onClick={simulateTransaction} 
              className="action-button"
              disabled={!isConnected}
            >
              Simulate Transaction
            </button>
          </div>
          {error && (
            <div className="error-display">
              <h3>Global Error:</h3>
              <p>{error.message}</p>
              <button onClick={clearError} className="secondary-button">
                Clear Error
              </button>
            </div>
          )}
        </div>

        {/* Event Log Section */}
        <div className="demo-card full-width">
          <h2>Event Log (Real-time State Changes)</h2>
          <div className="event-log">
            {eventLog.length === 0 ? (
              <p className="empty-log">No events yet. Connect your wallet or perform actions to see events.</p>
            ) : (
              eventLog.map((entry, index) => (
                <div key={index} className="log-entry">
                  <span className="log-time">{entry.timestamp}</span>
                  <span className="log-message">{entry.message}</span>
                </div>
              ))
            )}
          </div>
          <button 
            onClick={() => setEventLog([])} 
            className="secondary-button"
            disabled={eventLog.length === 0}
          >
            Clear Log
          </button>
        </div>

        {/* State Explanation Section */}
        <div className="demo-card full-width info-card">
          <h2>How This Works</h2>
          <div className="info-grid">
            <div className="info-item">
              <h3>No Prop Drilling</h3>
              <p>All state is accessed via hooks. No props passed down multiple levels.</p>
              <code>const {'{ account }'} = useAccount()</code>
            </div>
            <div className="info-item">
              <h3>Global State</h3>
              <p>Web3 and UI state are managed in React Context, accessible anywhere.</p>
              <code>const {'{ showNotification }'} = useNotification()</code>
            </div>
            <div className="info-item">
              <h3>Event Responsive</h3>
              <p>Automatically responds to blockchain events and wallet changes.</p>
              <code>useAccountChange(callback)</code>
            </div>
            <div className="info-item">
              <h3>Accessible</h3>
              <p>Screen reader announcements and ARIA attributes built-in.</p>
              <code>announce('Action completed')</code>
            </div>
          </div>
        </div>
      </div>

      {networkError && (
        <div className="network-error-banner" role="alert">
          ⚠️ {networkError}
        </div>
      )}
    </div>
  )
}

export default StateManagementDemo
