import { useState } from 'react'
import './TokenMintHeroCard.css'

function TokenMintHeroCard({ token, onClose, onMint, onBurn, onTransfer, onListOnETCSwap }) {
  const [activeTab, setActiveTab] = useState('info') // 'info', 'allocation', 'activity'
  const [actionMode, setActionMode] = useState(null) // 'mint', 'burn', 'transfer', null
  const [actionData, setActionData] = useState({ address: '', amount: '', tokenURI: '' })

  if (!token) return null

  const handleAction = async (action) => {
    try {
      switch (action) {
        case 'mint':
          await onMint(token.tokenId, actionData)
          break
        case 'burn':
          await onBurn(token.tokenId, actionData)
          break
        case 'transfer':
          await onTransfer(token.tokenId, actionData)
          break
      }
      setActionMode(null)
      setActionData({ address: '', amount: '', tokenURI: '' })
    } catch (error) {
      console.error(`Error during ${action}:`, error)
      alert(`Failed to ${action}: ${error.message}`)
    }
  }

  return (
    <div className="tokenmint-hero-overlay" onClick={onClose}>
      <div className="tokenmint-hero-card" onClick={(e) => e.stopPropagation()}>
        <div className="hero-header">
          <button className="back-btn" onClick={onClose} aria-label="Close">
            ← Back
          </button>
          <div className="header-info">
            <span className={`token-type-badge ${token.tokenType === 0 ? 'erc20' : 'erc721'}`}>
              {token.tokenType === 0 ? 'ERC-20' : 'ERC-721'}
            </span>
            <h2>{token.name}</h2>
            <p className="token-symbol">{token.symbol}</p>
          </div>
        </div>

        <div className="hero-body">
          {/* Token Info Grid */}
          <div className="info-grid">
            <div className="info-card">
              <div className="info-label">Contract Address</div>
              <div className="info-value address">
                <code>{token.tokenAddress.slice(0, 10)}...{token.tokenAddress.slice(-8)}</code>
                <button 
                  onClick={() => navigator.clipboard.writeText(token.tokenAddress)
                    .catch(err => console.error('Failed to copy:', err))}
                  className="copy-btn"
                  aria-label="Copy address"
                >
                  📋
                </button>
              </div>
            </div>

            <div className="info-card">
              <div className="info-label">Created</div>
              <div className="info-value">
                {new Date(token.createdAt * 1000).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </div>
            </div>

            <div className="info-card">
              <div className="info-label">Features</div>
              <div className="info-value features">
                {token.isBurnable && <span className="feature-badge">🔥 Burnable</span>}
                {token.isPausable && <span className="feature-badge">⏸️ Pausable</span>}
                {!token.isBurnable && !token.isPausable && <span className="feature-badge">Basic</span>}
              </div>
            </div>

            {token.metadataURI && (
              <div className="info-card">
                <div className="info-label">Metadata</div>
                <div className="info-value">
                  <a 
                    href={token.metadataURI.startsWith('ipfs://') 
                      ? `https://ipfs.io/ipfs/${token.metadataURI.replace('ipfs://', '')}` 
                      : token.metadataURI}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="metadata-link"
                  >
                    View Metadata →
                  </a>
                </div>
              </div>
            )}

            {token.tokenType === 0 && (
              <div className="info-card">
                <div className="info-label">ETCSwap Status</div>
                <div className="info-value">
                  {token.listedOnETCSwap ? (
                    <span className="status-badge listed">✓ Listed</span>
                  ) : (
                    <button 
                      onClick={() => onListOnETCSwap(token.tokenId)}
                      className="list-btn"
                    >
                      List on ETCSwap →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Admin Actions */}
          <div className="admin-actions">
            <h3>Token Management</h3>
            <div className="action-buttons">
              <button 
                className="action-btn mint"
                onClick={() => setActionMode('mint')}
                disabled={actionMode !== null}
              >
                <span className="btn-icon">➕</span>
                Mint
              </button>
              {token.isBurnable && (
                <button 
                  className="action-btn burn"
                  onClick={() => setActionMode('burn')}
                  disabled={actionMode !== null}
                >
                  <span className="btn-icon">🔥</span>
                  Burn
                </button>
              )}
              <button 
                className="action-btn transfer"
                onClick={() => setActionMode('transfer')}
                disabled={actionMode !== null}
              >
                <span className="btn-icon">📤</span>
                Transfer
              </button>
            </div>

            {/* Action Form */}
            {actionMode && (
              <div className="action-form">
                <h4>{actionMode.charAt(0).toUpperCase() + actionMode.slice(1)} {token.tokenType === 0 ? 'Tokens' : 'NFT'}</h4>
                
                {actionMode === 'mint' && (
                  <>
                    <div className="form-group">
                      <label>To Address</label>
                      <input 
                        type="text"
                        placeholder="0x..."
                        value={actionData.address}
                        onChange={(e) => setActionData({...actionData, address: e.target.value})}
                      />
                    </div>
                    {token.tokenType === 0 ? (
                      <div className="form-group">
                        <label>Amount</label>
                        <input 
                          type="number"
                          placeholder="1000"
                          value={actionData.amount}
                          onChange={(e) => setActionData({...actionData, amount: e.target.value})}
                        />
                      </div>
                    ) : (
                      <div className="form-group">
                        <label>Token URI</label>
                        <input 
                          type="text"
                          placeholder="ipfs://..."
                          value={actionData.tokenURI}
                          onChange={(e) => setActionData({...actionData, tokenURI: e.target.value})}
                        />
                      </div>
                    )}
                  </>
                )}

                {actionMode === 'burn' && (
                  <>
                    {token.tokenType === 0 ? (
                      <div className="form-group">
                        <label>Amount to Burn</label>
                        <input 
                          type="number"
                          placeholder="100"
                          value={actionData.amount}
                          onChange={(e) => setActionData({...actionData, amount: e.target.value})}
                        />
                      </div>
                    ) : (
                      <div className="form-group">
                        <label>Token ID to Burn</label>
                        <input 
                          type="number"
                          placeholder="1"
                          value={actionData.amount}
                          onChange={(e) => setActionData({...actionData, amount: e.target.value})}
                        />
                      </div>
                    )}
                  </>
                )}

                {actionMode === 'transfer' && (
                  <>
                    <div className="form-group">
                      <label>To Address</label>
                      <input 
                        type="text"
                        placeholder="0x..."
                        value={actionData.address}
                        onChange={(e) => setActionData({...actionData, address: e.target.value})}
                      />
                    </div>
                    {token.tokenType === 0 && (
                      <div className="form-group">
                        <label>Amount</label>
                        <input 
                          type="number"
                          placeholder="100"
                          value={actionData.amount}
                          onChange={(e) => setActionData({...actionData, amount: e.target.value})}
                        />
                      </div>
                    )}
                  </>
                )}

                <div className="form-actions">
                  <button 
                    className="cancel-btn"
                    onClick={() => {
                      setActionMode(null)
                      setActionData({ address: '', amount: '', tokenURI: '' })
                    }}
                  >
                    Cancel
                  </button>
                  <button 
                    className="submit-btn"
                    onClick={() => handleAction(actionMode)}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="hero-tabs">
            <button 
              className={`tab-btn ${activeTab === 'info' ? 'active' : ''}`}
              onClick={() => setActiveTab('info')}
            >
              Information
            </button>
            <button 
              className={`tab-btn ${activeTab === 'allocation' ? 'active' : ''}`}
              onClick={() => setActiveTab('allocation')}
            >
              Allocation
            </button>
            <button 
              className={`tab-btn ${activeTab === 'activity' ? 'active' : ''}`}
              onClick={() => setActiveTab('activity')}
            >
              Activity
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'info' && (
              <div className="info-content">
                <p className="placeholder-text">
                  Detailed token information and statistics would appear here.
                </p>
              </div>
            )}
            {activeTab === 'allocation' && (
              <div className="allocation-content">
                <p className="placeholder-text">
                  Token holder allocation chart and list would appear here.
                </p>
              </div>
            )}
            {activeTab === 'activity' && (
              <div className="activity-content">
                <p className="placeholder-text">
                  Recent token transfers and activity feed would appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TokenMintHeroCard
