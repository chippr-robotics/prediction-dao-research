import { useState, useCallback } from 'react'
import { useNotification } from '../../hooks/useUI'
import { useNullifierContracts } from '../../hooks/useNullifierContracts'
import { isValidEthereumAddress } from '../../utils/validation'
import { computeMarketHashSimple } from '../../utils/primeMapping'

/**
 * NullifierTab Component
 *
 * Admin panel tab for managing nullified markets and addresses.
 * Provides interface for:
 * - Viewing nullification statistics
 * - Nullifying/reinstating markets
 * - Nullifying/reinstating addresses
 * - Viewing nullified items list
 */
function NullifierTab({ provider, signer, account, marketFactoryAddress }) {
  const { showNotification } = useNotification()
  const {
    isLoading,
    nullifierState,
    nullifiedMarkets,
    nullifiedAddresses,
    hasNullifierRole,
    isRegistryAvailable,
    nullifyMarketByHash,
    reinstateMarket,
    nullifyAddress,
    reinstateAddress,
    fetchNullifierState,
    fetchNullifiedMarkets,
    fetchNullifiedAddresses
  } = useNullifierContracts({ provider, signer, account })

  // Local state
  const [pendingTx, setPendingTx] = useState(false)
  const [marketInput, setMarketInput] = useState({ id: '', reason: '' })
  const [addressInput, setAddressInput] = useState({ address: '', reason: '' })
  const [activeSection, setActiveSection] = useState('markets') // 'markets' or 'addresses'
  const [showNullifiedList, setShowNullifiedList] = useState(false)

  // Handle market nullification
  const handleNullifyMarket = useCallback(async () => {
    if (!marketInput.id || marketInput.id.trim() === '') {
      showNotification('Please enter a market ID', 'error')
      return
    }

    const marketId = parseInt(marketInput.id, 10)
    if (isNaN(marketId) || marketId < 0) {
      showNotification('Invalid market ID', 'error')
      return
    }

    setPendingTx(true)
    try {
      // Compute simple market hash using factory address + ID
      const marketHash = computeMarketHashSimple(marketFactoryAddress, marketId)

      await nullifyMarketByHash(
        marketHash,
        marketId,
        marketInput.reason || 'Admin nullification'
      )

      showNotification(`Market #${marketId} nullified successfully`, 'success')
      setMarketInput({ id: '', reason: '' })
    } catch (err) {
      console.error('Error nullifying market:', err)
      showNotification(err.message || 'Failed to nullify market', 'error')
    } finally {
      setPendingTx(false)
    }
  }, [marketInput, marketFactoryAddress, nullifyMarketByHash, showNotification])

  // Handle market reinstatement
  const handleReinstateMarket = useCallback(async (marketHash, marketId) => {
    setPendingTx(true)
    try {
      await reinstateMarket(marketHash, marketId, 'Admin reinstatement')
      showNotification(`Market reinstated successfully`, 'success')
    } catch (err) {
      console.error('Error reinstating market:', err)
      showNotification(err.message || 'Failed to reinstate market', 'error')
    } finally {
      setPendingTx(false)
    }
  }, [reinstateMarket, showNotification])

  // Handle address nullification
  const handleNullifyAddress = useCallback(async () => {
    if (!isValidEthereumAddress(addressInput.address)) {
      showNotification('Invalid Ethereum address', 'error')
      return
    }

    setPendingTx(true)
    try {
      await nullifyAddress(
        addressInput.address,
        addressInput.reason || 'Admin nullification'
      )

      showNotification(`Address nullified successfully`, 'success')
      setAddressInput({ address: '', reason: '' })
    } catch (err) {
      console.error('Error nullifying address:', err)
      showNotification(err.message || 'Failed to nullify address', 'error')
    } finally {
      setPendingTx(false)
    }
  }, [addressInput, nullifyAddress, showNotification])

  // Handle address reinstatement
  const handleReinstateAddress = useCallback(async (address) => {
    setPendingTx(true)
    try {
      await reinstateAddress(address, 'Admin reinstatement')
      showNotification(`Address reinstated successfully`, 'success')
    } catch (err) {
      console.error('Error reinstating address:', err)
      showNotification(err.message || 'Failed to reinstate address', 'error')
    } finally {
      setPendingTx(false)
    }
  }, [reinstateAddress, showNotification])

  // Shorten hash/address for display
  const shortenHash = (hash) => {
    if (!hash) return ''
    return `${hash.substring(0, 10)}...${hash.substring(hash.length - 8)}`
  }

  // Format timestamp
  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'
    return new Date(timestamp * 1000).toLocaleString()
  }

  // Show not available message if registry not deployed
  if (!isRegistryAvailable) {
    return (
      <div className="admin-tab-content" role="tabpanel">
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>Nullifier Registry Not Available</h3>
          </div>
          <p className="card-info">
            The Nullifier Registry contract has not been deployed or configured.
            Please set the VITE_NULLIFIER_REGISTRY_ADDRESS environment variable.
          </p>
        </div>
      </div>
    )
  }

  // Show permission denied if user doesn't have role
  if (!hasNullifierRole) {
    return (
      <div className="admin-tab-content" role="tabpanel">
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>Insufficient Permissions</h3>
          </div>
          <p className="card-info">
            You need the NULLIFIER_ADMIN_ROLE to manage nullifications.
            Contact a system administrator to request access.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-tab-content" role="tabpanel">
      {/* Statistics Overview */}
      <div className="overview-grid">
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>Nullification Statistics</h3>
            <button
              onClick={() => {
                fetchNullifierState()
                fetchNullifiedMarkets()
                fetchNullifiedAddresses()
              }}
              className="refresh-btn"
              aria-label="Refresh statistics"
              disabled={isLoading}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6"/>
                <path d="M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
          </div>
          <div className="status-details">
            <div className="status-row">
              <span className="status-label">Nullified Markets</span>
              <span className="status-value">{nullifierState.nullifiedMarketCount}</span>
            </div>
            <div className="status-row">
              <span className="status-label">Nullified Addresses</span>
              <span className="status-value">{nullifierState.nullifiedAddressCount}</span>
            </div>
            <div className="status-row">
              <span className="status-label">Total Operations</span>
              <span className="status-value">
                {nullifierState.totalNullifications + nullifierState.totalReinstatements}
              </span>
            </div>
            <div className="status-row">
              <span className="status-label">Last Update</span>
              <span className="status-value">{formatDate(nullifierState.lastAccumulatorUpdate)}</span>
            </div>
            <div className="status-row">
              <span className="status-label">Registry Status</span>
              <span className={`status-value ${nullifierState.paused ? 'paused' : 'active'}`}>
                {nullifierState.paused ? 'Paused' : 'Active'}
              </span>
            </div>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <h3>RSA Accumulator</h3>
          </div>
          <div className="status-details">
            <div className="status-row">
              <span className="status-label">Params Initialized</span>
              <span className={`status-value ${nullifierState.paramsInitialized ? 'active' : 'paused'}`}>
                {nullifierState.paramsInitialized ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="status-row">
              <span className="status-label">Accumulator</span>
              <span className="status-value" style={{ fontSize: '0.85em', fontFamily: 'monospace' }}>
                {nullifierState.accumulator ? shortenHash(nullifierState.accumulator) : 'Not set'}
              </span>
            </div>
          </div>
          <p className="card-info" style={{ marginTop: '1rem' }}>
            The RSA accumulator enables efficient membership proofs for the nullifier set.
          </p>
        </div>
      </div>

      {/* Section Toggle */}
      <div className="nullifier-section-toggle" style={{ marginTop: '1.5rem' }}>
        <button
          className={`admin-panel-tab ${activeSection === 'markets' ? 'active' : ''}`}
          onClick={() => setActiveSection('markets')}
        >
          Nullify Markets
        </button>
        <button
          className={`admin-panel-tab ${activeSection === 'addresses' ? 'active' : ''}`}
          onClick={() => setActiveSection('addresses')}
        >
          Nullify Addresses
        </button>
      </div>

      {/* Market Nullification Section */}
      {activeSection === 'markets' && (
        <div className="nullifier-form-section" style={{ marginTop: '1.5rem' }}>
          <div className="admin-card">
            <div className="admin-card-header">
              <h3>Nullify Market</h3>
            </div>
            <p className="card-info">
              Nullifying a market will prevent it from being displayed in the frontend and
              block all trading operations when on-chain enforcement is enabled.
            </p>

            <div className="nullifier-form" style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label htmlFor="market-id">Market ID</label>
                <input
                  id="market-id"
                  type="number"
                  min="0"
                  value={marketInput.id}
                  onChange={(e) => setMarketInput(prev => ({ ...prev, id: e.target.value }))}
                  className="admin-input"
                  placeholder="Enter market ID (e.g., 0, 1, 2...)"
                />
              </div>

              <div className="form-group">
                <label htmlFor="market-reason">Reason (optional)</label>
                <input
                  id="market-reason"
                  type="text"
                  value={marketInput.reason}
                  onChange={(e) => setMarketInput(prev => ({ ...prev, reason: e.target.value }))}
                  className="admin-input"
                  placeholder="Reason for nullification"
                />
              </div>

              <button
                onClick={handleNullifyMarket}
                className="admin-btn danger"
                disabled={pendingTx || isLoading || !marketInput.id}
                style={{ marginTop: '1rem' }}
              >
                {pendingTx ? 'Processing...' : 'Nullify Market'}
              </button>
            </div>
          </div>

          {/* Nullified Markets List */}
          <div className="admin-card" style={{ marginTop: '1.5rem' }}>
            <div className="admin-card-header">
              <h3>Nullified Markets ({nullifiedMarkets.length})</h3>
              <button
                onClick={() => setShowNullifiedList(!showNullifiedList)}
                className="refresh-btn"
              >
                {showNullifiedList ? 'Hide' : 'Show'}
              </button>
            </div>

            {showNullifiedList && nullifiedMarkets.length > 0 && (
              <div className="nullified-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Market Hash</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nullifiedMarkets.map((hash, index) => (
                      <tr key={hash} style={{ borderTop: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.85em' }}>
                          {shortenHash(hash)}
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.5rem' }}>
                          <button
                            onClick={() => handleReinstateMarket(hash, index)}
                            className="admin-btn secondary"
                            disabled={pendingTx}
                            style={{ padding: '0.25rem 0.75rem', fontSize: '0.85em' }}
                          >
                            Reinstate
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {showNullifiedList && nullifiedMarkets.length === 0 && (
              <p className="card-info">No markets have been nullified.</p>
            )}
          </div>
        </div>
      )}

      {/* Address Nullification Section */}
      {activeSection === 'addresses' && (
        <div className="nullifier-form-section" style={{ marginTop: '1.5rem' }}>
          <div className="admin-card">
            <div className="admin-card-header">
              <h3>Nullify Address</h3>
            </div>
            <p className="card-info">
              Nullifying an address will prevent it from trading on any market when
              on-chain enforcement is enabled. Use with caution.
            </p>

            <div className="nullifier-form" style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label htmlFor="nullify-address">Ethereum Address</label>
                <input
                  id="nullify-address"
                  type="text"
                  value={addressInput.address}
                  onChange={(e) => setAddressInput(prev => ({ ...prev, address: e.target.value }))}
                  className="admin-input"
                  placeholder="0x..."
                />
              </div>

              <div className="form-group">
                <label htmlFor="address-reason">Reason (optional)</label>
                <input
                  id="address-reason"
                  type="text"
                  value={addressInput.reason}
                  onChange={(e) => setAddressInput(prev => ({ ...prev, reason: e.target.value }))}
                  className="admin-input"
                  placeholder="Reason for nullification"
                />
              </div>

              <button
                onClick={handleNullifyAddress}
                className="admin-btn danger"
                disabled={pendingTx || isLoading || !addressInput.address}
                style={{ marginTop: '1rem' }}
              >
                {pendingTx ? 'Processing...' : 'Nullify Address'}
              </button>
            </div>
          </div>

          {/* Nullified Addresses List */}
          <div className="admin-card" style={{ marginTop: '1.5rem' }}>
            <div className="admin-card-header">
              <h3>Nullified Addresses ({nullifiedAddresses.length})</h3>
              <button
                onClick={() => setShowNullifiedList(!showNullifiedList)}
                className="refresh-btn"
              >
                {showNullifiedList ? 'Hide' : 'Show'}
              </button>
            </div>

            {showNullifiedList && nullifiedAddresses.length > 0 && (
              <div className="nullified-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '0.5rem' }}>Address</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nullifiedAddresses.map((addr) => (
                      <tr key={addr} style={{ borderTop: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.85em' }}>
                          {shortenHash(addr)}
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.5rem' }}>
                          <button
                            onClick={() => handleReinstateAddress(addr)}
                            className="admin-btn secondary"
                            disabled={pendingTx}
                            style={{ padding: '0.25rem 0.75rem', fontSize: '0.85em' }}
                          >
                            Reinstate
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {showNullifiedList && nullifiedAddresses.length === 0 && (
              <p className="card-info">No addresses have been nullified.</p>
            )}
          </div>
        </div>
      )}

      {/* Warning Notice */}
      <div className="admin-card warning-card" style={{ marginTop: '1.5rem' }}>
        <div className="admin-card-header">
          <h3>Security Notice</h3>
        </div>
        <p className="card-info warning-text">
          <span className="warning-icon">!</span>
          Nullification is a powerful protection mechanism. Use it responsibly:
        </p>
        <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
          <li>Document reasons for all nullification actions</li>
          <li>Coordinate with other admins before batch operations</li>
          <li>Review nullified items periodically for potential reinstatement</li>
          <li>RSA accumulator updates are computed off-chain for gas efficiency</li>
        </ul>
      </div>
    </div>
  )
}

export default NullifierTab
