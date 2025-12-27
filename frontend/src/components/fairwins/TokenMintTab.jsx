import { useState } from 'react'
import './TokenMintTab.css'

function TokenMintTab({ tokens, loading, onTokenClick, onCreateToken }) {
  const [sortBy, setSortBy] = useState('createdAt') // 'createdAt', 'name', 'type'

  // Sort tokens
  const sortedTokens = [...tokens].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name)
      case 'type':
        return a.tokenType - b.tokenType
      case 'createdAt':
      default:
        return b.createdAt - a.createdAt
    }
  })

  if (loading) {
    return (
      <div className="tokenmint-tab">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading your tokens...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="tokenmint-tab">
      <div className="tokenmint-header">
        <div className="header-content">
          <h2>🪙 My Tokens</h2>
          <p className="token-count">{tokens.length} token{tokens.length !== 1 ? 's' : ''} created</p>
        </div>
        <button 
          className="create-token-btn"
          onClick={onCreateToken}
          aria-label="Create new token"
        >
          <span aria-hidden="true">+</span> Create Token
        </button>
      </div>

      {tokens.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true">🪙</div>
          <h3>No Tokens Yet</h3>
          <p>Create your first ERC-20 or ERC-721 token to get started</p>
          <button 
            className="empty-create-btn"
            onClick={onCreateToken}
          >
            Create Your First Token
          </button>
        </div>
      ) : (
        <>
          <div className="tokenmint-controls">
            <div className="sort-control">
              <label htmlFor="token-sort">Sort by:</label>
              <select 
                id="token-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="sort-select"
              >
                <option value="createdAt">Recently Created</option>
                <option value="name">Name</option>
                <option value="type">Type</option>
              </select>
            </div>
          </div>

          <div className="tokens-table-container">
            <table className="tokens-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Symbol</th>
                  <th>Address</th>
                  <th>Created</th>
                  <th>Features</th>
                  <th>ETCSwap</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedTokens.map((token) => (
                  <tr 
                    key={token.tokenId}
                    className="token-row"
                    onClick={() => onTokenClick(token)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onTokenClick(token)
                      }
                    }}
                  >
                    <td>
                      <span className={`token-type-badge ${token.tokenType === 0 ? 'erc20' : 'erc721'}`}>
                        {token.tokenType === 0 ? 'ERC-20' : 'ERC-721'}
                      </span>
                    </td>
                    <td className="token-name">
                      <div className="name-cell">
                        <span className="name-text">{token.name}</span>
                        {token.metadataURI && (
                          <a 
                            href={token.metadataURI.startsWith('ipfs://') 
                              ? `https://ipfs.io/ipfs/${token.metadataURI.replace('ipfs://', '')}` 
                              : token.metadataURI}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="metadata-link"
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`View metadata for ${token.name}`}
                          >
                            📄
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="token-symbol">{token.symbol}</td>
                    <td className="token-address">
                      <code className="address-code">
                        {token.tokenAddress.slice(0, 6)}...{token.tokenAddress.slice(-4)}
                      </code>
                      <button
                        className="copy-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigator.clipboard.writeText(token.tokenAddress)
                            .catch(err => console.error('Failed to copy:', err))
                        }}
                        aria-label={`Copy address for ${token.name}`}
                      >
                        📋
                      </button>
                    </td>
                    <td className="token-created">
                      {token.createdAt 
                        ? new Date(token.createdAt * 1000).toLocaleDateString()
                        : 'Unknown'}
                    </td>
                    <td className="token-features">
                      <div className="feature-badges">
                        {token.isBurnable && <span className="feature-badge">🔥 Burnable</span>}
                        {token.isPausable && <span className="feature-badge">⏸️ Pausable</span>}
                      </div>
                    </td>
                    <td className="token-etcswap">
                      {token.tokenType === 0 && (
                        <span className={`etcswap-status ${token.listedOnETCSwap ? 'listed' : 'not-listed'}`}>
                          {token.listedOnETCSwap ? '✓ Listed' : '✗ Not Listed'}
                        </span>
                      )}
                    </td>
                    <td className="token-actions">
                      <button
                        className="view-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          onTokenClick(token)
                        }}
                        aria-label={`View details for ${token.name}`}
                      >
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default TokenMintTab
