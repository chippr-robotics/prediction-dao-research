import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeb3, useWallet } from '../hooks/useWeb3'
import Header from './Header'
import './LandingPage.css'

function LandingPage() {
  const navigate = useNavigate()
  const { isConnected } = useWeb3()
  const { connectWallet } = useWallet()
  const [logoErrors, setLogoErrors] = useState({ fairwins: false })

  const handleBrowseMarkets = () => {
    navigate('/fairwins')
  }

  const handleLogoError = (platform) => {
    setLogoErrors(prev => ({ ...prev, [platform]: true }))
  }

  const isDevelopment = import.meta.env.DEV

  return (
    <div className="landing-page">
      {/* Sticky Header */}
      <Header hideWalletButton={true} />

      {/* Hero Split Section - 66% Left / 33% Right */}
      <section className="hero-split-section" id="hero">
        <div className="hero-container">
          {/* Left Column (66%) - FairWins Hero */}
          <div className="hero-left">
            {/* FairWins Hero Content */}
            <div className="platforms-compact">
              <h2 className="section-title-compact">Harness the Wisdom of the Crowd</h2>
              <div className="platform-cards-compact">
                {/* FairWins Main Card */}
                <div className="platform-card-compact fairwins">
                  <div className="platform-card-header-compact">
                 {!logoErrors.fairwins ? (
                    <img 
                      src="/logo_fairwins.svg" 
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
                      <p className="platform-tagline-compact">Prediction Markets for Everyone</p>
                    </div>
                  </div>
                  <p className="platform-description-compact">
                    Tap into collective intelligence through prediction markets. When people put money behind their predictions, the crowd becomes remarkably accurate.
                  </p>
                  <ul className="platform-features-compact">
                    <li>✓ Create markets on any topic</li>
                    <li>✓ Trade on collective predictions</li>
                    <li>✓ Earn from accurate forecasts</li>
                    <li>✓ Transparent on-chain resolution</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (33%) - CTA Sidebar */}
          <div className="hero-right">
            <div className="cta-sidebar">
              <button 
                onClick={handleBrowseMarkets} 
                className="cta-button-sidebar primary"
              >
                <span className="button-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                </span>
                Explore Markets
              </button>
              
              {/* Social Media Placeholders */}
              <div className="social-links">
                <button onClick={(e) => e.preventDefault()} className="social-link" aria-label="Twitter (Coming Soon)">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </button>
                <button onClick={(e) => e.preventDefault()} className="social-link" aria-label="Discord (Coming Soon)">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                </button>
                <button onClick={(e) => e.preventDefault()} className="social-link" aria-label="GitHub (Coming Soon)">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Prediction Markets Work - Full Width Section */}
      <section className="enterprise-full-width" id="features">
        <div className="container">
          <h2 className="section-title">Why Prediction Markets Work</h2>
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
              <h3>Aggregated Knowledge</h3>
              <p>Markets collect information from diverse participants with different perspectives and expertise</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <h3>Financial Incentives</h3>
              <p>Real money rewards accurate predictions, ensuring informed participants have stronger influence</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h3>Transparent Outcomes</h3>
              <p>All trades and resolutions are visible on-chain for complete accountability</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <h3>Price Discovery</h3>
              <p>Market prices continuously reflect the collective probability assessment of outcomes</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <h3>Anti-Manipulation</h3>
              <p>MACI-style privacy mechanisms protect against collusion and vote buying</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </div>
              <h3>Global Participation</h3>
              <p>Anyone can contribute their knowledge, democratizing expertise and predictions</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works-section" id="how-it-works">
        <div className="container">
          <h2 className="section-title">How the Wisdom of the Crowd Works</h2>
          <p className="section-intro">
            Prediction markets harness collective intelligence by aggregating diverse knowledge and rewarding accuracy
          </p>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">1</div>
              <h3>Market Creation</h3>
              <p>
                Anyone can create a prediction market about future outcomes—from elections and sports 
                to company performance and scientific discoveries. Clear resolution criteria ensure fair settlement.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">2</div>
              <h3>Information Aggregation</h3>
              <p>
                Participants with knowledge, research, or insights trade based on their predictions. 
                The market price naturally gravitates toward the collective probability assessment.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">3</div>
              <h3>Financial Incentives</h3>
              <p>
                Traders buy outcome tokens at current market prices. Those who predict correctly 
                earn profits, while incorrect predictions result in losses. This aligns incentives with accuracy.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">4</div>
              <h3>Price Discovery</h3>
              <p>
                As new information emerges, prices update in real-time. The market price represents 
                the crowd's best estimate of the probability that an outcome will occur.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">5</div>
              <h3>Market Resolution</h3>
              <p>
                When the outcome is determined, an oracle reports the result. There's a challenge 
                period for disputes, ensuring accurate resolution before markets settle.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">6</div>
              <h3>Settlement & Rewards</h3>
              <p>
                Winners redeem their tokens for their share of the pool plus earnings from those 
                who predicted incorrectly. Accurate forecasters are rewarded, incentivizing expertise.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Different Section */}
      <section className="comparison-section">
        <div className="container">
          <h2 className="section-title">Why Prediction Markets Beat Traditional Polling</h2>
          <div className="comparison-grid">
            <div className="comparison-card">
              <h3>💰 Skin in the Game</h3>
              <p>
                Unlike surveys where responses have no consequences, prediction markets require 
                real financial commitment. This filters out noise and rewards those with genuine 
                knowledge and conviction.
              </p>
            </div>
            <div className="comparison-card">
              <h3>🎯 Incentivized Accuracy</h3>
              <p>
                Polls ask "what do you think?" with no reward for being right. Prediction markets 
                reward accurate forecasts with real profits, ensuring participants research thoroughly 
                and predict honestly.
              </p>
            </div>
            <div className="comparison-card">
              <h3>📊 Continuous Updates</h3>
              <p>
                Traditional polls are snapshots in time. Prediction markets update continuously as 
                new information emerges, providing real-time probability assessments that evolve 
                with events.
              </p>
            </div>
            <div className="comparison-card">
              <h3>🌐 Self-Weighted Expertise</h3>
              <p>
                Polls give everyone equal weight. Markets naturally weight expertise—informed 
                participants trade more and with higher stakes, while casual observers contribute 
                less to price formation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="use-cases-section" id="use-cases">
        <div className="container">
          <h2 className="section-title">Real-World Applications</h2>
          <p className="section-intro">
            See how FairWins prediction markets work in different scenarios
          </p>
          <div className="use-cases-grid">
            <div className="use-case-card">
              <div className="use-case-icon">🗳️</div>
              <h3>Election Forecasting</h3>
              <p className="use-case-description">
                <strong>The Scenario:</strong> A presidential election is approaching and people want 
                to track the probability of different outcomes more accurately than traditional polls.
              </p>
              <p className="use-case-description">
                <strong>How It Works:</strong> Traders buy tokens representing different candidates. 
                As new polls, debates, and events occur, prices update in real-time to reflect the 
                collective probability assessment. The market price becomes the best predictor.
              </p>
              <p className="use-case-outcome">
                <strong>The Result:</strong> More accurate forecasts than polls alone, as participants 
                with insider knowledge or superior analysis are rewarded for their contributions.
              </p>
            </div>
            <div className="use-case-card">
              <div className="use-case-icon">🏈</div>
              <h3>Sports Predictions</h3>
              <p className="use-case-description">
                <strong>The Scenario:</strong> A group of friends wants to predict championship outcomes, 
                player performance, or season records with skin in the game.
              </p>
              <p className="use-case-description">
                <strong>How It Works:</strong> Create private or public markets for specific outcomes. 
                Participants trade based on their knowledge of teams, players, and statistics. Accurate 
                predictions earn rewards from those who predicted incorrectly.
              </p>
              <p className="use-case-outcome">
                <strong>The Result:</strong> Engaging competition that rewards sports knowledge and 
                analytical skills, with transparent on-chain settlement.
              </p>
            </div>
            <div className="use-case-card">
              <div className="use-case-icon">📈</div>
              <h3>Financial Forecasting</h3>
              <p className="use-case-description">
                <strong>The Scenario:</strong> Investors want to predict economic indicators, company 
                performance, or market movements through crowdsourced analysis.
              </p>
              <p className="use-case-description">
                <strong>How It Works:</strong> Markets are created for specific predictions like "Will 
                unemployment drop below 4%?" or "Will Company X beat earnings estimates?" Traders 
                aggregate diverse financial expertise through their trading activity.
              </p>
              <p className="use-case-outcome">
                <strong>The Result:</strong> Sophisticated forecasts that incorporate signals from 
                many analysts, often outperforming individual expert predictions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ClearPath Add-on Section */}
      <section className="understanding-section">
        <div className="container">
          <h2 className="section-title">ClearPath: DAO Governance Add-on</h2>
          <p className="section-intro">
            Optional enterprise-grade governance features for institutional decision-making
          </p>
          <div className="understanding-content">
            <div className="understanding-text">
              <h3>Two Governance Modes for Your Organization</h3>
              <p>
                ClearPath is an optional add-on that transforms FairWins into a complete DAO governance 
                platform. Choose between traditional democratic voting or futarchy-based prediction markets, 
                depending on your organization's needs.
              </p>
              <h4>Traditional Voting Mode</h4>
              <p>
                Familiar democratic governance where token holders vote directly on proposals. Each token 
                equals one vote, with configurable quorum requirements and simple majority approval. 
                Proposals pass based on For/Against votes with a default 40% quorum threshold. Includes 
                timelock periods for execution safety and transparent on-chain tracking of all votes.
              </p>
              <h4>Futarchy Mode: "Vote on Values, Bet on Beliefs"</h4>
              <p>
                An innovative approach that separates values from predictions. The DAO democratically 
                decides what success metrics matter (treasury growth, user adoption, project milestones). 
                Then, anyone can trade on prediction markets about which proposals will achieve those goals. 
                This harnesses global expertise while letting the organization maintain control over its values.
              </p>
            </div>
            <div className="understanding-visual">
              <div className="visual-box vote">
                <h4>Traditional Voting</h4>
                <ul>
                  <li>1 token = 1 vote</li>
                  <li>For/Against/Abstain options</li>
                  <li>Quorum requirements</li>
                  <li>Timelock execution</li>
                  <li>Simple majority wins</li>
                </ul>
              </div>
              <div className="visual-arrow">OR</div>
              <div className="visual-box bet">
                <h4>Futarchy Markets</h4>
                <ul>
                  <li>Define success metrics</li>
                  <li>Open prediction markets</li>
                  <li>Trade on proposal outcomes</li>
                  <li>Market confidence determines approval</li>
                  <li>Rewards accurate predictions</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="clearpath-features">
            <h3>Enterprise Features</h3>
            <div className="features-grid">
              <div className="feature-item">
                <strong>Treasury Management:</strong> Shared pool governance with proposal-based spending
              </div>
              <div className="feature-item">
                <strong>Role-Based Access:</strong> Control who can submit proposals and vote
              </div>
              <div className="feature-item">
                <strong>Minority Protection:</strong> Ragequit functionality lets members exit with their share
              </div>
              <div className="feature-item">
                <strong>Privacy Mechanisms:</strong> MACI-style anti-collusion for sensitive decisions
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TokenMint Add-on Section */}
      <section className="tokenmint-section">
        <div className="container">
          <h2 className="section-title">TokenMint: Enterprise Token Management Add-on</h2>
          <p className="section-intro">
            Create and manage custom tokens for your DAO or organization
          </p>
          <div className="tokenmint-content">
            <div className="tokenmint-description">
              <p>
                TokenMint is an optional add-on that enables organizations to create governance tokens, 
                reward tokens, or custom assets with advanced distribution and access control features.
              </p>
              <div className="tokenmint-features-grid">
                <div className="tokenmint-feature">
                  <h4>🪙 Token Creation</h4>
                  <p>Deploy custom ERC-20 tokens with configurable parameters including name, symbol, supply, and decimals</p>
                </div>
                <div className="tokenmint-feature">
                  <h4>📅 Vesting Schedules</h4>
                  <p>Set up time-based token releases for team members, advisors, or community distributions</p>
                </div>
                <div className="tokenmint-feature">
                  <h4>🔐 Access Control</h4>
                  <p>Role-based permissions for minting, burning, and administrative operations</p>
                </div>
                <div className="tokenmint-feature">
                  <h4>🔗 Platform Integration</h4>
                  <p>Seamlessly integrate your tokens with FairWins markets and ClearPath governance</p>
                </div>
              </div>
            </div>
            <div className="tokenmint-use-cases">
              <h3>Common Use Cases</h3>
              <ul>
                <li><strong>DAO Governance Tokens:</strong> Create voting tokens for ClearPath governance</li>
                <li><strong>Reward Programs:</strong> Issue tokens as rewards for platform participation</li>
                <li><strong>Community Tokens:</strong> Build token economies for your community or project</li>
                <li><strong>Access Tokens:</strong> Gate features or content with custom tokens</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="container">
          <h2>Ready to Get Started?</h2>
          <p>Choose your platform to begin</p>
          <button onClick={() => navigate('/select')} className="cta-button large">
            Choose Platform
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-section">
              <h3>FairWins</h3>
              <p>Prediction markets platform with optional DAO governance</p>
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
