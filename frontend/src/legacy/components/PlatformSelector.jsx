import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './PlatformSelector.css'

function PlatformSelector() {
  const navigate = useNavigate()
  const [announcement, setAnnouncement] = useState('')

  const handlePlatformSelect = async (platform, platformName) => {
    // Both platforms can be accessed without wallet connection
    // Users will be prompted to connect when they need to interact
    setAnnouncement(`Navigating to ${platformName}...`)
    navigate(`/${platform}`)
  }

  const handleCardKeyDown = (e, platform, platformName) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handlePlatformSelect(platform, platformName)
    }
  }

  return (
    <div className="platform-selector">
      {/* Screen reader announcements */}
      <div 
        role="status" 
        aria-live="polite" 
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      {/* Hero Section */}
      <section className="selector-hero">
        <div className="hero-content">
          <img 
            src="/logo_fwcp.svg" 
            alt="ClearPath and FairWins combined logo" 
            className="hero-logo"
            width="120"
            height="120"
          />
          <h1 className="hero-title">Welcome to the Future of Decision-Making</h1>
          <p className="hero-subtitle">
            Choose your path: Governance or Prediction Markets
          </p>
        </div>
      </section>

      {/* Platform Selection Cards */}
      <section className="platforms-section" aria-label="Platform Selection">
        <div className="container">
          <h2 className="sr-only">Select a Platform</h2>
          <div className="platforms-grid">
            {/* ClearPath Card */}
            <article 
              className="platform-card clearpath"
              role="button"
              tabIndex="0"
              onClick={() => handlePlatformSelect('clearpath', 'ClearPath')}
              onKeyDown={(e) => handleCardKeyDown(e, 'clearpath', 'ClearPath')}
              aria-label="ClearPath: DAO Governance Platform - Institutional-grade governance through futarchy-based decision-making"
            >
              <div className="platform-logo" aria-hidden="true">
                <img 
                  src="/assets/logo_clearpath.svg" 
                  alt="" 
                  className="logo-image"
                  width="60"
                  height="60"
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
                <li><span aria-hidden="true">✓</span> Futarchy-based governance</li>
                <li><span aria-hidden="true">✓</span> Treasury management</li>
                <li><span aria-hidden="true">✓</span> Proposal evaluation</li>
                <li><span aria-hidden="true">✓</span> Welfare metrics tracking</li>
                <li><span aria-hidden="true">✓</span> Shielded transaction privacy</li>
              </ul>
              <div className="platform-button-wrapper">
                <span className="platform-button clearpath-button" aria-hidden="true">
                  Enter ClearPath
                </span>
              </div>
              <div className="platform-footer">
                <span className="badge" aria-label="Category: DAO Platform">DAO Platform</span>
              </div>
            </article>

            {/* FairWins Card */}
            <article 
              className="platform-card fairwins"
              role="button"
              tabIndex="0"
              onClick={() => handlePlatformSelect('fairwins', 'FairWins')}
              onKeyDown={(e) => handleCardKeyDown(e, 'fairwins', 'FairWins')}
              aria-label="FairWins: Open Prediction Markets - Create, join, and resolve prediction markets on any topic"
            >
              <div className="platform-logo" aria-hidden="true">
                <img 
                  src="/assets/logo_fairwins.svg" 
                  alt="" 
                  className="logo-image"
                  width="60"
                  height="60"
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
                <li><span aria-hidden="true">✓</span> Create custom markets</li>
                <li><span aria-hidden="true">✓</span> Trade predictions</li>
                <li><span aria-hidden="true">✓</span> Flexible resolution</li>
                <li><span aria-hidden="true">✓</span> Open participation</li>
                <li><span aria-hidden="true">✓</span> Fully transparent trading</li>
              </ul>
              <div className="platform-button-wrapper">
                <span className="platform-button fairwins-button" aria-hidden="true">
                  Enter FairWins
                </span>
              </div>
              <div className="platform-footer">
                <span className="badge" aria-label="Category: Prediction Market">Prediction Market</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* Shared Infrastructure Section */}
      <section className="shared-section" aria-labelledby="shared-tech-heading">
        <div className="container">
          <h2 id="shared-tech-heading" className="section-title">Built on Shared, Proven Technology</h2>
          <p className="section-intro">
            Both platforms leverage the same secure infrastructure with conditional privacy features
          </p>
          <div className="tech-grid">
            <article className="tech-card">
              <div className="tech-icon" aria-hidden="true">🔒</div>
              <h3>Conditional Privacy</h3>
              <p>ClearPath DAOs use shielded transactions; FairWins markets are transparent</p>
            </article>
            <article className="tech-card">
              <div className="tech-icon" aria-hidden="true">🛡️</div>
              <h3>Anti-Collusion</h3>
              <p>MACI-style key-change mechanisms prevent coordinated manipulation</p>
            </article>
            <article className="tech-card">
              <div className="tech-icon" aria-hidden="true">📊</div>
              <h3>Market Mechanics</h3>
              <p>Logarithmic Market Scoring Rule with automated liquidity</p>
            </article>
            <article className="tech-card">
              <div className="tech-icon" aria-hidden="true">🔍</div>
              <h3>Oracle Resolution</h3>
              <p>Multi-stage verification with challenge periods and dispute resolution</p>
            </article>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="selector-footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-section">
              <h3>Platforms</h3>
              <p>ClearPath DAO & FairWins Markets</p>
            </div>
            <div className="footer-section">
              <h3>Technology</h3>
              <ul>
                <li><a href="https://blog.zkga.me/nightmarket" target="_blank" rel="noopener noreferrer">Nightmarket Privacy</a></li>
                <li><a href="https://github.com/privacy-scaling-explorations/maci" target="_blank" rel="noopener noreferrer">MACI Anti-Collusion</a></li>
                <li><a href="https://docs.gnosis.io/conditionaltokens/" target="_blank" rel="noopener noreferrer">Gnosis Conditional Tokens</a></li>
              </ul>
            </div>
            <div className="footer-section">
              <h3>Resources</h3>
              <ul>
                <li><a href="https://docs.FairWins.app/" target="_blank" rel="noopener noreferrer">Documentation</a></li>
                <li><a href="https://docs.FairWins.app/developer-guide/setup/" target="_blank" rel="noopener noreferrer">Developer Guide</a></li>
                <li><a href="https://docs.FairWins.app/security/" target="_blank" rel="noopener noreferrer">Security Audits</a></li>
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
