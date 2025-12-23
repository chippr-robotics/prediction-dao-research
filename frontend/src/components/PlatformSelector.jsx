import './PlatformSelector.css'

function PlatformSelector({ onSelectPlatform }) {
  return (
    <div className="platform-selector">
      {/* Hero Section */}
      <section className="selector-hero">
        <div className="hero-content">
          <img 
            src="/docs/assets/logo_fwcp.png" 
            alt="ClearPath & FairWins Logo" 
            className="hero-logo"
          />
          <h1 className="hero-title">Welcome to the Future of Decision-Making</h1>
          <p className="hero-subtitle">
            Choose your path: Governance or Prediction Markets
          </p>
        </div>
      </section>

      {/* Platform Selection Cards */}
      <section className="platforms-section">
        <div className="container">
          <div className="platforms-grid">
            {/* ClearPath Card */}
            <div className="platform-card clearpath">
              <div className="platform-logo">
                <img 
                  src="/docs/assets/logo_clearpath.png" 
                  alt="ClearPath Logo" 
                  className="logo-image"
                  onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block' }}
                />
                <div className="platform-icon" style={{display: 'none'}}>🏛️</div>
              </div>
              <h2>ClearPath</h2>
              <p className="platform-tagline">DAO Governance Platform</p>
              <p className="platform-description">
                Institutional-grade governance through futarchy-based decision-making. 
                Combine democratic voting with prediction markets for transparent, 
                data-driven outcomes in decentralized organizations.
              </p>
              <ul className="platform-features">
                <li>✓ Futarchy-based governance</li>
                <li>✓ Treasury management</li>
                <li>✓ Proposal evaluation</li>
                <li>✓ Welfare metrics tracking</li>
                <li>✓ Privacy-preserving voting</li>
              </ul>
              <button 
                onClick={() => onSelectPlatform('clearpath')} 
                className="platform-button clearpath-button"
              >
                Enter ClearPath
              </button>
              <div className="platform-footer">
                <span className="badge">DAO Platform</span>
              </div>
            </div>

            {/* FairWins Card */}
            <div className="platform-card fairwins">
              <div className="platform-logo">
                <img 
                  src="/docs/assets/logo_fairwins.png" 
                  alt="FairWins Logo" 
                  className="logo-image"
                  onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block' }}
                />
                <div className="platform-icon" style={{display: 'none'}}>🎯</div>
              </div>
              <h2>FairWins</h2>
              <p className="platform-tagline">Open Prediction Markets</p>
              <p className="platform-description">
                Create, join, and resolve prediction markets on any topic. 
                Fair, flexible controls allow anyone to participate and profit 
                from their knowledge with transparent, market-driven outcomes.
              </p>
              <ul className="platform-features">
                <li>✓ Create custom markets</li>
                <li>✓ Trade predictions</li>
                <li>✓ Flexible resolution</li>
                <li>✓ Open participation</li>
                <li>✓ Fair market controls</li>
              </ul>
              <button 
                onClick={() => onSelectPlatform('fairwins')} 
                className="platform-button fairwins-button"
              >
                Enter FairWins
              </button>
              <div className="platform-footer">
                <span className="badge">Prediction Market</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Shared Infrastructure Section */}
      <section className="shared-section">
        <div className="container">
          <h2 className="section-title">Built on Shared, Proven Technology</h2>
          <p className="section-intro">
            Both platforms leverage the same secure, privacy-preserving infrastructure
          </p>
          <div className="tech-grid">
            <div className="tech-card">
              <div className="tech-icon">🔒</div>
              <h3>Privacy-Preserving</h3>
              <p>Zero-knowledge proofs and encrypted voting protect participant privacy</p>
            </div>
            <div className="tech-card">
              <div className="tech-icon">🛡️</div>
              <h3>Anti-Collusion</h3>
              <p>MACI-style key-change mechanisms prevent coordinated manipulation</p>
            </div>
            <div className="tech-card">
              <div className="tech-icon">📊</div>
              <h3>Market Mechanics</h3>
              <p>Logarithmic Market Scoring Rule with automated liquidity</p>
            </div>
            <div className="tech-card">
              <div className="tech-icon">🔍</div>
              <h3>Oracle Resolution</h3>
              <p>Multi-stage verification with challenge periods and dispute resolution</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="selector-footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-section">
              <h4>Platforms</h4>
              <p>ClearPath DAO & FairWins Markets</p>
            </div>
            <div className="footer-section">
              <h4>Technology</h4>
              <ul>
                <li>Nightmarket Privacy</li>
                <li>MACI Anti-Collusion</li>
                <li>Gnosis Conditional Tokens</li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>Resources</h4>
              <ul>
                <li>Documentation</li>
                <li>Developer Guide</li>
                <li>Security Audits</li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2024 ChipprRobotics LLC. Apache License 2.0</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default PlatformSelector
