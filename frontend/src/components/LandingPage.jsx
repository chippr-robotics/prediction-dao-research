import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from './Header'
import './LandingPage.css'

function LandingPage() {
  const navigate = useNavigate()
  const [logoErrors, setLogoErrors] = useState({ fairwins: false })

  const handleGetStarted = () => {
    navigate('/app')
  }

  const handleLogoError = (platform) => {
    setLogoErrors(prev => ({ ...prev, [platform]: true }))
  }

  return (
    <div className="landing-page">
      {/* Sticky Header */}
      <Header hideWalletButton={true} />

      {/* Hero Split Section - 66% Left / 33% Right */}
      <section className="hero-split-section" id="hero">
        <div className="hero-container">
          {/* Left Column (66%) - Hero Content */}
          <div className="hero-left">
            <div className="platforms-compact">
              <h2 className="section-title-compact">Private Wagers Between Friends</h2>
              <div className="platform-cards-compact">
                <div className="platform-card-compact fairwins">
                  <div className="platform-card-header-compact">
                 {!logoErrors.fairwins ? (
                    <img
                      src="/assets/logo_fairwins.svg"
                      alt="FairWins"
                      className="platform-logo-compact"
                      width="48"
                      height="48"
                      onError={() => handleLogoError('fairwins')}
                    />
                  ) : (
                    <div className="platform-logo-fallback" aria-label="FairWins">FW</div>
                  )}
                    <div>
                      <h3>FairWins</h3>
                      <p className="platform-tagline-compact">P2P Wager Management Layer</p>
                    </div>
                  </div>
                  <p className="platform-description-compact">
                    Create private wagers with friends that automatically resolve using trusted oracles.
                    FairWins handles the stakes, disputes, and payouts—so you can focus on the bet.
                  </p>
                  <ul className="platform-features-compact">
                    <li>&#10003; 1v1 and group wagers with friends</li>
                    <li>&#10003; Auto-resolve via Polymarket, Chainlink, UMA</li>
                    <li>&#10003; QR code sharing for instant invites</li>
                    <li>&#10003; Built-in dispute resolution and escrow</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (33%) - CTA Sidebar */}
          <div className="hero-right">
            <div className="cta-sidebar">
              <button
                onClick={handleGetStarted}
                className="cta-button-sidebar primary"
              >
                <span className="button-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </span>
                Create a Wager
              </button>

              {/* Social Media Links */}
              <div className="social-links">
                <a href="https://x.com/fairwins_app" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Twitter/X">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>
                <a href="https://discord.gg/rkYvPFdRRr" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Discord">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                </a>
                <a href="https://instagram.com/fairwinsapp" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Instagram">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </a>
                <a href="https://github.com/chippr-robotics/prediction-dao-research" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="GitHub">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                </a>
              </div>

              <p className="membership-note-sidebar">
                Contact for more info:{' '}
                <a href="mailto:Howdy@FairWins.App" aria-label="Email Howdy@FairWins.App">Howdy@FairWins.App</a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How P2P Wagers Work Section */}
      <section className="enterprise-full-width" id="features">
        <div className="container">
          <h2 className="section-title">Why Private P2P Wagers</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3>Bet With Friends</h3>
              <p>Create private 1v1 or group wagers with people you know. No public order books, no anonymous counterparties.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h3>Trustless Escrow</h3>
              <p>Stakes are locked in smart contracts until resolution. No one can run off with the money.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h3>Oracle-Backed Resolution</h3>
              <p>Wagers auto-resolve via Polymarket outcomes, Chainlink price feeds, or UMA assertions. No arguing about results.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <h3>Dispute Protection</h3>
              <p>24-hour challenge period on manual resolutions. Escalate disputes to neutral arbitration if needed.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </div>
              <h3>Share via QR Code</h3>
              <p>Generate a QR code or deep link after creating a wager. Your friend scans it to accept the bet instantly.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <h3>Flexible Stakes</h3>
              <p>Wager with stablecoins, ETC, or custom tokens. Set your own stake amounts and acceptance deadlines.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works-section" id="how-it-works">
        <div className="container">
          <h2 className="section-title">How It Works</h2>
          <p className="section-intro">
            Create a wager, share it, and let the smart contract handle the rest
          </p>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">1</div>
              <h3>Create Your Wager</h3>
              <p>
                Pick a topic, set your stake, and choose how the wager resolves.
                Link it to a Polymarket outcome, Chainlink price feed, or resolve it manually with your friends.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">2</div>
              <h3>Share the Invite</h3>
              <p>
                Get a QR code or shareable link. Send it to your friend or group.
                They review the terms and stake their side of the bet. Both stakes are locked in escrow.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">3</div>
              <h3>Wait for the Outcome</h3>
              <p>
                The wager is live. Track it in your dashboard.
                When the event happens, the oracle reports the result automatically, or the creator resolves it manually.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">4</div>
              <h3>Challenge Period</h3>
              <p>
                For manual resolutions, there's a 24-hour window where either party can dispute the result.
                This keeps things fair without needing to trust a single person.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">5</div>
              <h3>Claim Your Winnings</h3>
              <p>
                Once resolved and undisputed, the winner claims the full pot from the smart contract.
                If unclaimed after 90 days, funds return to the treasury as a safety net.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">6</div>
              <h3>Oracle Timeout Safety</h3>
              <p>
                If an external oracle stalls for 30+ days, both parties can trigger a mutual refund.
                No one gets stuck waiting forever.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Oracle Sources Section */}
      <section className="comparison-section">
        <div className="container">
          <h2 className="section-title">Multi-Oracle Resolution</h2>
          <div className="comparison-grid">
            <div className="comparison-card">
              <h3>Polymarket</h3>
              <p>
                Peg your wager to any Polymarket outcome. When the Polymarket event resolves,
                your friend wager resolves automatically. Covers elections, sports, world events, and more.
              </p>
            </div>
            <div className="comparison-card">
              <h3>Chainlink Price Feeds</h3>
              <p>
                Set price-based wagers like "Will BTC be above $100k by June?"
                Chainlink's decentralized price feeds provide tamper-proof price data for settlement.
              </p>
            </div>
            <div className="comparison-card">
              <h3>UMA Optimistic Oracle</h3>
              <p>
                For custom claims that don't fit standard feeds. Assert any truth statement
                and let UMA's dispute mechanism ensure honest resolution.
              </p>
            </div>
            <div className="comparison-card">
              <h3>Manual + Challenge</h3>
              <p>
                The creator resolves the wager, and the counterparty gets a 24-hour window
                to challenge. Simple and trust-minimized for casual bets between friends.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="use-cases-section" id="use-cases">
        <div className="container">
          <h2 className="section-title">What People Bet On</h2>
          <p className="section-intro">
            Any event with a clear outcome can be a wager
          </p>
          <div className="use-cases-grid">
            <div className="use-case-card">
              <div className="use-case-icon">&#127944;</div>
              <h3>Sports Bets</h3>
              <p className="use-case-description">
                <strong>The Setup:</strong> You and your buddy disagree about who wins the Super Bowl.
                Create a 1v1 wager pegged to a Polymarket event.
              </p>
              <p className="use-case-description">
                <strong>How It Plays Out:</strong> Both of you stake $50 in USC. When the game
                is over and Polymarket resolves, the winner's contract balance updates automatically.
                Claim your $100 with one click.
              </p>
            </div>
            <div className="use-case-card">
              <div className="use-case-icon">&#128200;</div>
              <h3>Price Predictions</h3>
              <p className="use-case-description">
                <strong>The Setup:</strong> Your group chat is arguing about whether ETH will hit $5k.
                Create a group wager with a Chainlink price feed as the oracle.
              </p>
              <p className="use-case-description">
                <strong>How It Plays Out:</strong> Everyone stakes in. When the deadline hits,
                Chainlink's price feed settles it. No screenshots of CoinGecko needed.
              </p>
            </div>
            <div className="use-case-card">
              <div className="use-case-icon">&#127922;</div>
              <h3>Anything Else</h3>
              <p className="use-case-description">
                <strong>The Setup:</strong> Will your coworker finish the marathon? Will it snow on
                Christmas? Use manual resolution with challenge period for any custom bet.
              </p>
              <p className="use-case-description">
                <strong>How It Plays Out:</strong> The creator resolves it, the other side has 24 hours
                to dispute if they disagree. Stakes stay locked until everyone agrees.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="container">
          <h2>Ready to Make a Bet?</h2>
          <p>Create your first wager in under a minute</p>
          <button onClick={handleGetStarted} className="cta-button large">
            Get Started
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-section">
              <h3>FairWins</h3>
              <p>P2P wager management layer with multi-oracle resolution</p>
            </div>
            <div className="footer-section">
              <h3>Oracles</h3>
              <ul>
                <li><a href="https://polymarket.com" target="_blank" rel="noopener noreferrer">Polymarket</a></li>
                <li><a href="https://chain.link" target="_blank" rel="noopener noreferrer">Chainlink</a></li>
                <li><a href="https://uma.xyz" target="_blank" rel="noopener noreferrer">UMA Protocol</a></li>
              </ul>
            </div>
            <div className="footer-section">
              <h3>Documentation</h3>
              <ul>
                <li><a href="https://docs.FairWins.app/user-guide/getting-started/" target="_blank" rel="noopener noreferrer">User Guide</a></li>
                <li><a href="https://docs.FairWins.app/developer-guide/setup/" target="_blank" rel="noopener noreferrer">Developer Docs</a></li>
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

export default LandingPage
