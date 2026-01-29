/**
 * TokenTypeStep Component
 *
 * Step 1: Token type selection (ERC-20 vs ERC-721)
 * Features large, card-based selection with clear descriptions.
 * Uses radio inputs for proper mutually exclusive selection and accessibility.
 */
function TokenTypeStep({ tokenType, onTokenTypeChange, disabled }) {
  return (
    <div className="tcm-step-content">
      <div className="tcm-section">
        <h3 className="tcm-section-title">Select Token Type</h3>
        <p className="tcm-section-desc">
          Choose the type of token you want to create. This cannot be changed after deployment.
        </p>

        <div className="tcm-type-grid">
          {/* ERC-20 Card */}
          <label
            className={`tcm-type-card ${tokenType === 'ERC20' ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
          >
            <input
              type="radio"
              name="tokenType"
              value="ERC20"
              checked={tokenType === 'ERC20'}
              onChange={() => onTokenTypeChange('ERC20')}
              disabled={disabled}
              className="tcm-type-radio"
            />
            <div className="tcm-type-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v12M6 12h12" />
              </svg>
            </div>
            <div className="tcm-type-header">
              <span className="tcm-type-name">ERC-20</span>
              <span className="tcm-type-subtitle">Fungible Token</span>
            </div>
            <p className="tcm-type-description">
              Create a standard fungible token with customizable supply. Perfect for currencies, rewards, governance tokens, and more.
            </p>
            <ul className="tcm-type-features">
              <li>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Custom initial supply
              </li>
              <li>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Optional burn/pause
              </li>
              <li>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                DEX listing support
              </li>
            </ul>
          </label>

          {/* ERC-721 Card */}
          <label
            className={`tcm-type-card ${tokenType === 'ERC721' ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
          >
            <input
              type="radio"
              name="tokenType"
              value="ERC721"
              checked={tokenType === 'ERC721'}
              onChange={() => onTokenTypeChange('ERC721')}
              disabled={disabled}
              className="tcm-type-radio"
            />
            <div className="tcm-type-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </div>
            <div className="tcm-type-header">
              <span className="tcm-type-name">ERC-721</span>
              <span className="tcm-type-subtitle">NFT Collection</span>
            </div>
            <p className="tcm-type-description">
              Create a non-fungible token collection with unique metadata for each item. Ideal for art, collectibles, and digital assets.
            </p>
            <ul className="tcm-type-features">
              <li>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Unique token IDs
              </li>
              <li>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Metadata per token
              </li>
              <li>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Optional burn
              </li>
            </ul>
          </label>
        </div>
      </div>
    </div>
  )
}

export default TokenTypeStep
