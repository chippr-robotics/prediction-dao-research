import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeb3, useWallet } from '../hooks/useWeb3'
import Header from './Header'
import './LandingPage.css'

function LandingPage() {
  const navigate = useNavigate()
  const { isConnected } = useWeb3()
  const { connectWallet } = useWallet()
  const [isClearPathMember, setIsClearPathMember] = useState(false)
  const [logoErrors, setLogoErrors] = useState({ fairwins: false, clearpath: false })

  const handleConnectForClearPath = async () => {
    const success = await connectWallet()
    if (success) {
      // In the future, this will check the ClearPath DAO contract for membership
      // For now, we use the toggle state
      if (isClearPathMember) {
        navigate('/clearpath')
      }
    }
  }

  const handleBrowseMarkets = () => {
    navigate('/fairwins')
  }

  const handleLogoError = (platform) => {
    setLogoErrors(prev => ({ ...prev, [platform]: true }))
  }

  const showClearPathBranding = isConnected && isClearPathMember
  const isDevelopment = import.meta.env.DEV

  return (
    <div className="landing-page">
      {/* Sticky Header */}
      <Header showClearPathBranding={showClearPathBranding} hideWalletButton={true} />

      {/* Temporary ClearPath Membership Toggle (for development) */}
      {isDevelopment && isConnected && (
        <div className="dev-toggle-banner">
          <label className="toggle-label">
            <input 
              type="checkbox" 
              checked={isClearPathMember}
              onChange={(e) => setIsClearPathMember(e.target.checked)}
              className="toggle-checkbox"
            />
            <span className="toggle-text">
              ClearPath Member (Dev Toggle)
            </span>
          </label>
        </div>
      )}

      {/* Hero Split Section - 66% Left / 33% Right */}
      <section className="hero-split-section" id="hero">
        <div className="hero-container">
          {/* Left Column (66%) - Platform Cards */}
          <div className="hero-left">
            {!showClearPathBranding && (
              <>
                {/* Platform Cards */}
                <div className="platforms-compact">
                  <h2 className="section-title-compact">Two Complementary Platforms</h2>
                  <div className="platform-cards-compact">
                    {/* FairWins Card */}
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
                          <p className="platform-tagline-compact">Prediction Markets for Friends</p>
                        </div>
                      </div>
                      <p className="platform-description-compact">
                        Create and trade on prediction markets about any topic. Open to everyone.
                      </p>
                      <ul className="platform-features-compact">
                        <li>✓ No wallet required to browse</li>
                        <li>✓ Open to all participants</li>
                        <li>✓ Flexible market creation</li>
                      </ul>
                    </div>

                    {/* ClearPath Card */}
                    <div className="platform-card-compact clearpath">
                      <div className="platform-card-header-compact">
                        {!logoErrors.clearpath ? (
                          <img 
                            src="/logo_clearpath.svg" 
                            alt="ClearPath" 
                            className="platform-logo-compact"
                            width="48"
                            height="48"
                            onError={() => handleLogoError('clearpath')}
                          />
                        ) : (
                          <div className="platform-logo-fallback" aria-label="ClearPath">CP</div>
                        )}
                        <div>
                          <h3>ClearPath</h3>
                          <p className="platform-tagline-compact">DAO Governance Platform</p>
                        </div>
                      </div>
                      <p className="platform-description-compact">
                        Institutional-grade governance through futarchy for data-driven decisions.
                      </p>
                      <ul className="platform-features-compact">
                        <li>✓ Member-only governance</li>
                        <li>✓ Treasury management</li>
                        <li>✓ Shielded transactions</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </>
            )}
            
            {showClearPathBranding && (
              <div className="clearpath-welcome">
                <h1>Welcome Back to ClearPath</h1>
                <p>Access your DAO governance dashboard and participate in futarchy-based decision-making.</p>
              </div>
            )}
          </div>

          {/* Right Column (33%) - CTA Sidebar */}
          <div className="hero-right">
            <div className="cta-sidebar">
              {!isConnected ? (
                <>
                  <button 
                    onClick={handleConnectForClearPath} 
                    className="cta-button-sidebar primary"
                  >
                    <span className="button-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    </span>
                    Connect Wallet for ClearPath
                  </button>
                  <button 
                    onClick={handleBrowseMarkets} 
                    className="cta-button-sidebar secondary"
                  >
                    <span className="button-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="3" y1="9" x2="21" y2="9" />
                        <line x1="9" y1="21" x2="9" y2="9" />
                      </svg>
                    </span>
                    Explore FairWins Markets
                  </button>
                </>
              ) : showClearPathBranding ? (
                <button 
                  onClick={() => navigate('/clearpath')} 
                  className="cta-button-sidebar primary"
                >
                  Enter ClearPath Dashboard
                </button>
              ) : (
                <>
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
                    Explore FairWins Markets
                  </button>
                  <p className="membership-note-sidebar">
                    ClearPath membership required for governance access
                  </p>
                </>
              )}
              
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

      {/* Enterprise-Grade Governance - Full Width Section */}
      {!showClearPathBranding && (
        <section className="enterprise-full-width" id="features">
          <div className="container">
            <h2 className="section-title">Enterprise-Grade Governance</h2>
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon" aria-hidden="true">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <h3>Conditional Privacy</h3>
                <p>ClearPath uses shielded transactions; FairWins is transparent</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon" aria-hidden="true">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <h3>Anti-Collusion</h3>
                <p>MACI-style key-change mechanisms</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon" aria-hidden="true">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="20" x2="12" y2="10" />
                    <line x1="18" y1="20" x2="18" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="16" />
                  </svg>
                </div>
                <h3>Market Mechanics</h3>
                <p>Automated liquidity with bounded losses</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon" aria-hidden="true">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <h3>Minority Protection</h3>
                <p>Ragequit functionality for stakeholders</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon" aria-hidden="true">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <h3>Multi-Stage Oracle</h3>
                <p>Challenge period with dispute resolution</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon" aria-hidden="true">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <h3>Timelock Security</h3>
                <p>Delay periods and spending limits</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* How It Works Section */}
      <section className="how-it-works-section" id="how-it-works">
        <div className="container">
          <h2 className="section-title">How Prediction DAO Works</h2>
          <p className="section-intro">
            A simple, transparent process that combines the best of democracy with market wisdom
          </p>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">1</div>
              <h3>Pool Funds Together</h3>
              <p>
                Participants contribute stablecoins to a shared treasury. These funds become the 
                basis for collective decision-making, giving everyone a stake in the outcomes.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">2</div>
              <h3>Create Proposals</h3>
              <p>
                Anyone can propose how to use the treasury or predict future outcomes. Proposals 
                are clear and specific—like "fund this project" or "this metric will increase."
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">3</div>
              <h3>Purchase Votes</h3>
              <p>
                Instead of each person getting one vote, participants use their stablecoins to buy 
                votes. You put more behind ideas you truly believe in—aligning your money with your conviction.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">4</div>
              <h3>Vote on Outcomes</h3>
              <p>
                Voting happens through prediction markets. Buy "PASS" tokens if you think a proposal 
                will succeed, or "FAIL" tokens if you think it won't. Market prices reveal collective wisdom.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">5</div>
              <h3>Decision Time</h3>
              <p>
                The proposal either passes or fails based on vote count and market confidence. 
                Proposals with strong support move forward automatically, while weak ones are rejected.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">6</div>
              <h3>Token Settlement</h3>
              <p>
                After the outcome is verified, winners redeem their tokens for their share of the pool 
                plus rewards. Accurate predictions are rewarded, incentivizing honest participation and expertise.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Different Section */}
      <section className="comparison-section">
        <div className="container">
          <h2 className="section-title">How Is This Different from Regular Democracy?</h2>
          <div className="comparison-grid">
            <div className="comparison-card">
              <h3>💰 Market Incentives</h3>
              <p>
                Unlike traditional voting where everyone's vote counts the same regardless of expertise, 
                Prediction DAO rewards accurate predictions with real returns. This attracts informed 
                participants and ensures those with genuine knowledge have stronger influence.
              </p>
            </div>
            <div className="comparison-card">
              <h3>🎯 Prediction Accuracy</h3>
              <p>
                Regular democracy asks "what do you prefer?" Prediction DAO asks "what do you think 
                will actually happen?" This shifts focus from personal preference to factual prediction, 
                aggregating collective intelligence more effectively.
              </p>
            </div>
            <div className="comparison-card">
              <h3>🌐 Public Participation</h3>
              <p>
                Anyone with stablecoins can participate—not just pre-selected members or token holders. 
                The market is open to everyone, democratizing access while maintaining quality through 
                financial skin in the game.
              </p>
            </div>
            <div className="comparison-card">
              <h3>🏦 Treasury Mechanisms</h3>
              <p>
                Instead of tax-funded or membership-fee treasuries, funds are actively deployed in 
                prediction markets. This creates a self-sustaining system where the treasury grows 
                through successful decisions rather than constant fundraising.
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
            See how Prediction DAO works in different scenarios
          </p>
          <div className="use-cases-grid">
            <div className="use-case-card">
              <div className="use-case-icon">📊</div>
              <h3>Simple Prediction Market</h3>
              <p className="use-case-description">
                <strong>The Scenario:</strong> A community wants to track group welfare using a single 
                metric, like average happiness score or health index.
              </p>
              <p className="use-case-description">
                <strong>How It Works:</strong> Members propose different predictions for what the metric 
                will be in 6 months. Participants buy votes on their predicted values. When the time comes, 
                the actual value is measured and those who predicted accurately earn rewards from the pool.
              </p>
              <p className="use-case-outcome">
                <strong>The Result:</strong> The community continuously improves its forecasting ability 
                and can make informed decisions based on collective predictions.
              </p>
            </div>
            <div className="use-case-card">
              <div className="use-case-icon">🏛️</div>
              <h3>DAO-Style Treasury</h3>
              <p className="use-case-description">
                <strong>The Scenario:</strong> A group of investors pools their stablecoins and wants 
                to collectively decide how to invest or spend the funds.
              </p>
              <p className="use-case-description">
                <strong>How It Works:</strong> Members submit proposals like "invest in Project X" or 
                "fund this marketing campaign." Only members who contributed to the treasury can buy 
                votes. After voting, winning proposals get funded from the shared treasury.
              </p>
              <p className="use-case-outcome">
                <strong>The Result:</strong> Members with the most expertise and conviction lead 
                investment decisions, while everyone maintains proportional control over treasury use.
              </p>
            </div>
            <div className="use-case-card">
              <div className="use-case-icon">🌍</div>
              <h3>Futarchy-Style Public Market</h3>
              <p className="use-case-description">
                <strong>The Scenario:</strong> A DAO proposes policy changes or capital allocations 
                and wants to know which actions will best achieve their goals.
              </p>
              <p className="use-case-description">
                <strong>How It Works:</strong> The DAO sets clear success metrics (e.g., "increase 
                treasury value by 20%"). Anyone—not just members—can buy votes with stablecoins on 
                whether each proposal will achieve those metrics. Proposals with market confidence pass.
              </p>
              <p className="use-case-outcome">
                <strong>The Result:</strong> The DAO taps into global expertise by allowing anyone 
                to participate, making better decisions through market-aggregated intelligence.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Understanding Futarchy Section */}
      <section className="understanding-section">
        <div className="container">
          <h2 className="section-title">The Power of "Vote on Values, Bet on Beliefs"</h2>
          <div className="understanding-content">
            <div className="understanding-text">
              <h3>Separating What We Want from How to Get It</h3>
              <p>
                Traditional democracy asks people to vote on both their goals AND the best way to 
                achieve them. But what if we're not experts? Prediction DAO separates these questions.
              </p>
              <p>
                First, the group democratically decides what success looks like (treasury growth, 
                project adoption, community satisfaction). Then, anyone can participate in prediction 
                markets about which proposals will actually achieve those goals.
              </p>
              <p>
                This approach harnesses the wisdom of crowds—those with real expertise and information 
                are incentivized to participate because accurate predictions earn real rewards. Your 
                financial stake aligns with your knowledge, creating better decisions for everyone.
              </p>
            </div>
            <div className="understanding-visual">
              <div className="visual-box vote">
                <h4>Step 1: Define Success</h4>
                <p>Everyone votes on what matters</p>
                <ul>
                  <li>Treasury growth</li>
                  <li>Network security</li>
                  <li>User satisfaction</li>
                  <li>Project milestones</li>
                </ul>
              </div>
              <div className="visual-arrow">→</div>
              <div className="visual-box bet">
                <h4>Step 2: Predict Outcomes</h4>
                <p>Markets decide which proposals work</p>
                <ul>
                  <li>Buy PASS if it'll succeed</li>
                  <li>Buy FAIL if it'll fail</li>
                  <li>Market prices show confidence</li>
                  <li>Winners earn from the pool</li>
                </ul>
              </div>
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
              <h3>Clear Path</h3>
              <p>Institutional-grade governance through prediction markets</p>
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
