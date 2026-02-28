import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from './Header'
import './LandingPage.css'

function LandingPage() {
  const navigate = useNavigate()
  const [logoErrors, setLogoErrors] = useState({ fairwins: false })
  const [visibleSections, setVisibleSections] = useState(new Set())

  const handleGetStarted = () => {
    navigate('/app')
  }

  const handleLogoError = (platform) => {
    setLogoErrors(prev => ({ ...prev, [platform]: true }))
  }

  // Intersection observer for scroll-triggered animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleSections(prev => new Set([...prev, entry.target.id]))
          }
        })
      },
      { threshold: 0.15 }
    )

    const sections = document.querySelectorAll('[data-animate]')
    sections.forEach(section => observer.observe(section))

    return () => observer.disconnect()
  }, [])

  const isVisible = (id) => visibleSections.has(id)

  return (
    <div className="landing-page">
      <Header hideWalletButton={true} />

      {/* Hero Section - Full impact */}
      <section className="hero-section" id="hero">
        <div className="hero-bg-effects">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-orb hero-orb-3" />
          <div className="hero-grid-pattern" />
        </div>

        <div className="hero-content">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            Built on Ethereum Classic
          </div>

          <h1 className="hero-headline">
            Your Wager.<br />
            <span className="hero-headline-accent">Your Rules.</span><br />
            Your Oracle.
          </h1>

          <p className="hero-subtitle">
            Create private, trustless bets with friends.
            Smart contracts hold the stakes. Oracles decide the outcome.
            No middlemen. No arguments.
          </p>

          <div className="hero-actions">
            <button onClick={handleGetStarted} className="hero-cta-primary">
              <span>Launch App</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
            <button onClick={() => {
              const el = document.getElementById('how-it-works')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }} className="hero-cta-secondary">
              See How It Works
            </button>
          </div>

          <div className="hero-social">
            <a href="https://x.com/fairwins_app" target="_blank" rel="noopener noreferrer" className="hero-social-link" aria-label="Twitter/X">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
            <a href="https://discord.gg/rkYvPFdRRr" target="_blank" rel="noopener noreferrer" className="hero-social-link" aria-label="Discord">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
            </a>
            <a href="https://github.com/chippr-robotics/prediction-dao-research" target="_blank" rel="noopener noreferrer" className="hero-social-link" aria-label="GitHub">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </a>
            <a href="https://instagram.com/fairwinsapp" target="_blank" rel="noopener noreferrer" className="hero-social-link" aria-label="Instagram">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </a>
          </div>
        </div>

        {/* Floating preview card */}
        <div className="hero-preview">
          <div className="preview-card">
            <div className="preview-card-header">
              <div className="preview-status-live" />
              <span className="preview-label">Live Wager</span>
            </div>
            <div className="preview-question">Will BTC close above $100k on March 1?</div>
            <div className="preview-stakes">
              <div className="preview-stake">
                <span className="preview-stake-label">Your stake</span>
                <span className="preview-stake-value">0.5 ETC</span>
              </div>
              <div className="preview-vs">VS</div>
              <div className="preview-stake">
                <span className="preview-stake-label">Their stake</span>
                <span className="preview-stake-value">0.5 ETC</span>
              </div>
            </div>
            <div className="preview-oracle">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Resolves via Chainlink Price Feed
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Strip */}
      <section className="proof-strip">
        <div className="proof-strip-inner">
          <div className="proof-item">
            <span className="proof-number">4</span>
            <span className="proof-label">Oracle Sources</span>
          </div>
          <div className="proof-divider" />
          <div className="proof-item">
            <span className="proof-number">24hr</span>
            <span className="proof-label">Dispute Window</span>
          </div>
          <div className="proof-divider" />
          <div className="proof-item">
            <span className="proof-number">100%</span>
            <span className="proof-label">Non-Custodial</span>
          </div>
          <div className="proof-divider" />
          <div className="proof-item">
            <span className="proof-number">0</span>
            <span className="proof-label">Middlemen</span>
          </div>
        </div>
      </section>

      {/* Why FairWins - Value Props */}
      <section className={`value-section ${isVisible('value-props') ? 'visible' : ''}`} id="features">
        <div className="container" id="value-props" data-animate>
          <div className="section-header">
            <span className="section-tag">Why FairWins</span>
            <h2 className="section-title">Betting between friends,<br />done right</h2>
            <p className="section-subtitle">
              No bookmakers. No order books. Just you, your friend, and a smart contract that keeps everyone honest.
            </p>
          </div>

          <div className="value-grid">
            <div className="value-card value-card-featured">
              <div className="value-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h3>Trustless Escrow</h3>
              <p>Both sides stake into a smart contract. Funds are locked until the outcome is decided. Nobody can run off with the money.</p>
            </div>
            <div className="value-card">
              <div className="value-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h3>Oracle Resolution</h3>
              <p>Wagers auto-resolve using Polymarket, Chainlink, or UMA. No arguing about who won.</p>
            </div>
            <div className="value-card">
              <div className="value-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <h3>Dispute Protection</h3>
              <p>24-hour challenge period on manual resolutions. Escalate to neutral arbitration if needed.</p>
            </div>
            <div className="value-card">
              <div className="value-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3>Private & Social</h3>
              <p>Share wagers via QR code or deep link. Invite friends directly — no public order books.</p>
            </div>
            <div className="value-card">
              <div className="value-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <h3>Flexible Stakes</h3>
              <p>Wager with ETC, stablecoins, or custom tokens. Set your own amounts and deadlines.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Visual Timeline */}
      <section className={`steps-section ${isVisible('steps-area') ? 'visible' : ''}`} id="how-it-works">
        <div className="container" id="steps-area" data-animate>
          <div className="section-header">
            <span className="section-tag">How It Works</span>
            <h2 className="section-title">Three steps. That's it.</h2>
          </div>

          <div className="steps-timeline">
            <div className="timeline-line" />

            <div className="step-item">
              <div className="step-marker">
                <span>1</span>
              </div>
              <div className="step-content">
                <h3>Create</h3>
                <p>
                  Pick what you're betting on, set the stakes, and choose your oracle.
                  Link it to a Polymarket outcome, a Chainlink price feed, or resolve manually.
                </p>
              </div>
            </div>

            <div className="step-item">
              <div className="step-marker">
                <span>2</span>
              </div>
              <div className="step-content">
                <h3>Share</h3>
                <p>
                  Get a QR code or link. Send it to your friend.
                  They review the terms, stake their side, and both deposits lock into escrow.
                </p>
              </div>
            </div>

            <div className="step-item">
              <div className="step-marker">
                <span>3</span>
              </div>
              <div className="step-content">
                <h3>Settle</h3>
                <p>
                  The oracle reports the result. The winner claims the pot.
                  If it's manual, there's a 24-hour window to dispute. Fair and final.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Oracle Sources - Distinct Visual */}
      <section className={`oracles-section ${isVisible('oracles-area') ? 'visible' : ''}`}>
        <div className="container" id="oracles-area" data-animate>
          <div className="section-header">
            <span className="section-tag">Resolution Layer</span>
            <h2 className="section-title">Pick your truth source</h2>
            <p className="section-subtitle">
              Every wager needs a source of truth. Choose the oracle that fits your bet.
            </p>
          </div>

          <div className="oracle-grid">
            <div className="oracle-card oracle-polymarket">
              <div className="oracle-accent" />
              <div className="oracle-icon-badge">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <h3>Polymarket</h3>
              <p>Peg your wager to any Polymarket event. Elections, sports, world events — when it resolves there, yours resolves here.</p>
              <span className="oracle-use-case">Best for: Events & outcomes</span>
            </div>

            <div className="oracle-card oracle-chainlink">
              <div className="oracle-accent" />
              <div className="oracle-icon-badge">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <h3>Chainlink</h3>
              <p>Decentralized price feeds for crypto, forex, and commodities. Tamper-proof data settles your price bets automatically.</p>
              <span className="oracle-use-case">Best for: Price predictions</span>
            </div>

            <div className="oracle-card oracle-uma">
              <div className="oracle-accent" />
              <div className="oracle-icon-badge">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <h3>UMA Optimistic</h3>
              <p>Assert any truth statement and let UMA's dispute mechanism ensure honest resolution. Perfect for custom, creative bets.</p>
              <span className="oracle-use-case">Best for: Custom claims</span>
            </div>

            <div className="oracle-card oracle-manual">
              <div className="oracle-accent" />
              <div className="oracle-icon-badge">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3>Manual + Challenge</h3>
              <p>The creator resolves it. The other side gets 24 hours to dispute. Simple and trust-minimized for casual bets.</p>
              <span className="oracle-use-case">Best for: Casual bets with friends</span>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases - Scenario Stories */}
      <section className={`scenarios-section ${isVisible('scenarios-area') ? 'visible' : ''}`} id="use-cases">
        <div className="container" id="scenarios-area" data-animate>
          <div className="section-header">
            <span className="section-tag">Use Cases</span>
            <h2 className="section-title">What will you bet on?</h2>
          </div>

          <div className="scenario-grid">
            <div className="scenario-card">
              <div className="scenario-emoji">&#127944;</div>
              <h3>The Big Game</h3>
              <p className="scenario-setup">"I bet you $50 the Chiefs win the Super Bowl."</p>
              <p className="scenario-resolution">
                Pegged to Polymarket. Game ends, market resolves, winner claims the pot. One click.
              </p>
            </div>
            <div className="scenario-card">
              <div className="scenario-emoji">&#128200;</div>
              <h3>The Price Call</h3>
              <p className="scenario-setup">"No way ETH hits $5k by June."</p>
              <p className="scenario-resolution">
                Chainlink price feed as the oracle. When the deadline hits, the number speaks for itself.
              </p>
            </div>
            <div className="scenario-card">
              <div className="scenario-emoji">&#127922;</div>
              <h3>The Anything Bet</h3>
              <p className="scenario-setup">"If it snows on Christmas, you owe me dinner."</p>
              <p className="scenario-resolution">
                Manual resolution with a 24-hour challenge window. Stakes stay locked until both sides agree.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="final-cta">
        <div className="final-cta-bg">
          <div className="cta-orb cta-orb-1" />
          <div className="cta-orb cta-orb-2" />
        </div>
        <div className="final-cta-content">
          <h2>Ready to put your money<br />where your mouth is?</h2>
          <p>Create your first wager in under a minute.</p>
          <button onClick={handleGetStarted} className="hero-cta-primary cta-large">
            <span>Get Started</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
          <p className="cta-contact">
            Questions? <a href="mailto:Howdy@FairWins.App">Howdy@FairWins.App</a>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-section footer-brand">
              {!logoErrors.fairwins ? (
                <img
                  src="/assets/logo_fairwins.svg"
                  alt="FairWins"
                  className="footer-logo"
                  width="40"
                  height="40"
                  onError={() => handleLogoError('fairwins')}
                />
              ) : (
                <div className="footer-logo-fallback" aria-label="FairWins">FW</div>
              )}
              <p>P2P wager management layer with multi-oracle resolution.</p>
            </div>
            <div className="footer-section">
              <h4>Oracles</h4>
              <ul>
                <li><a href="https://polymarket.com" target="_blank" rel="noopener noreferrer">Polymarket</a></li>
                <li><a href="https://chain.link" target="_blank" rel="noopener noreferrer">Chainlink</a></li>
                <li><a href="https://uma.xyz" target="_blank" rel="noopener noreferrer">UMA Protocol</a></li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>Docs</h4>
              <ul>
                <li><a href="https://docs.FairWins.app/user-guide/getting-started/" target="_blank" rel="noopener noreferrer">User Guide</a></li>
                <li><a href="https://docs.FairWins.app/developer-guide/setup/" target="_blank" rel="noopener noreferrer">Developer Docs</a></li>
                <li><a href="https://docs.FairWins.app/security/" target="_blank" rel="noopener noreferrer">Security Audits</a></li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>Community</h4>
              <ul>
                <li><a href="https://x.com/fairwins_app" target="_blank" rel="noopener noreferrer">Twitter / X</a></li>
                <li><a href="https://discord.gg/rkYvPFdRRr" target="_blank" rel="noopener noreferrer">Discord</a></li>
                <li><a href="https://github.com/chippr-robotics/prediction-dao-research" target="_blank" rel="noopener noreferrer">GitHub</a></li>
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
