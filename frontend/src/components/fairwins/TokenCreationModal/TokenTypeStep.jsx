/**
 * TokenTypeStep Component
 *
 * Step 1: Token type selection (ERC-20 vs ERC-721)
 * Features large, card-based selection with clear descriptions.
 */
function TokenTypeStep({ tokenType, onTokenTypeChange, disabled }) {
  const tokenTypes = [
    {
      id: 'ERC20',
      name: 'ERC-20',
      subtitle: 'Fungible Token',
      description: 'Create a standard fungible token with customizable supply. Perfect for currencies, rewards, governance tokens, and more.',
      features: ['Custom initial supply', 'Optional burn/pause', 'DEX listing support'],
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v12M6 12h12" />
        </svg>
      )
    },
    {
      id: 'ERC721',
      name: 'ERC-721',
      subtitle: 'NFT Collection',
      description: 'Create a non-fungible token collection with unique metadata for each item. Ideal for art, collectibles, and digital assets.',
      features: ['Unique token IDs', 'Metadata per token', 'Optional burn'],
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      )
    }
  ]

  return (
    <div className="tcm-step-content">
      <div className="tcm-section">
        <h3 className="tcm-section-title">Select Token Type</h3>
        <p className="tcm-section-desc">
          Choose the type of token you want to create. This cannot be changed after deployment.
        </p>

        <div className="tcm-type-grid">
          {tokenTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              className={`tcm-type-card ${tokenType === type.id ? 'active' : ''}`}
              onClick={() => onTokenTypeChange(type.id)}
              disabled={disabled}
              aria-pressed={tokenType === type.id}
            >
              <div className="tcm-type-icon">{type.icon}</div>
              <div className="tcm-type-header">
                <span className="tcm-type-name">{type.name}</span>
                <span className="tcm-type-subtitle">{type.subtitle}</span>
              </div>
              <p className="tcm-type-description">{type.description}</p>
              <ul className="tcm-type-features">
                {type.features.map((feature, i) => (
                  <li key={i}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default TokenTypeStep
