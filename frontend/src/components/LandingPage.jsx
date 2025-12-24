import { useNavigate } from 'react-router-dom'
import './LandingPage.css'

function LandingPage() {
  const navigate = useNavigate()

  const handleGetStarted = () => {
    navigate('/select')
  }

  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">ClearPath</h1>
          <p className="hero-subtitle">
            Institutional-Grade Governance Through Prediction Markets
          </p>
          <p className="hero-description">
            Harness collective intelligence for informed decision-making in private equity governance. 
            ClearPath combines democratic voting with prediction markets to deliver transparent, 
            data-driven outcomes for institutional investors.
          </p>
          <button onClick={handleGetStarted} className="cta-button">
            Get Started
          </button>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works-section">
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
      <section className="use-cases-section">
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

      {/* Key Features Section */}
      <section className="features-section">
        <div className="container">
          <h2 className="section-title">Enterprise-Grade Governance</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🔒</div>
              <h3>Privacy-Preserving</h3>
              <p>
                Zero-knowledge proofs and encrypted voting ensure position privacy and prevent 
                vote buying. All transactions maintain institutional confidentiality standards.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🛡️</div>
              <h3>Anti-Collusion</h3>
              <p>
                MACI-style key-change mechanisms invalidate collusion agreements. Participants 
                can update their cryptographic keys to prevent coordinated manipulation.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Market Mechanics</h3>
              <p>
                Logarithmic Market Scoring Rule provides automated liquidity with bounded losses. 
                Time-weighted pricing reduces short-term manipulation risks.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚖️</div>
              <h3>Minority Protection</h3>
              <p>
                Ragequit functionality allows dissenting stakeholders to exit with their proportional 
                treasury share, preventing forced participation in controversial decisions.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔍</div>
              <h3>Multi-Stage Oracle</h3>
              <p>
                Designated reporting phase followed by open challenge period. Bond-based dispute 
                resolution ensures accurate outcome determination.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⏱️</div>
              <h3>Timelock Security</h3>
              <p>
                Mandatory delay periods and spending limits protect against hasty decisions. 
                Emergency pause capabilities provide additional safeguards.
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
          <button onClick={handleGetStarted} className="cta-button large">
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
                <li>Nightmarket Privacy</li>
                <li>MACI Anti-Collusion</li>
                <li>Gnosis Conditional Tokens</li>
              </ul>
            </div>
            <div className="footer-section">
              <h3>Documentation</h3>
              <ul>
                <li>User Guide</li>
                <li>Developer Docs</li>
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

export default LandingPage
