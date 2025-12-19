import './LandingPage.css'

function LandingPage({ onConnect }) {
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
          <button onClick={onConnect} className="cta-button">
            Connect Wallet to Begin
          </button>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works-section">
        <div className="container">
          <h2 className="section-title">How It Works</h2>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">1</div>
              <h3>Establish Welfare Metrics</h3>
              <p>
                Democratic voting determines the key performance indicators that define success 
                for your organization—treasury value, network activity, security metrics, and 
                development progress.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">2</div>
              <h3>Submit Proposals</h3>
              <p>
                Stakeholders submit governance proposals with clear objectives, funding requirements, 
                and milestone definitions. Each proposal undergoes thorough review before market creation.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">3</div>
              <h3>Market-Based Evaluation</h3>
              <p>
                Prediction markets aggregate distributed knowledge about each proposal's likely impact 
                on welfare metrics. Participants buy PASS or FAIL tokens based on their analysis.
              </p>
            </div>
            <div className="step-card">
              <div className="step-number">4</div>
              <h3>Execute Decisions</h3>
              <p>
                Proposals with strong market confidence are executed automatically. Oracle systems 
                verify outcomes, and participants redeem their positions based on actual results.
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
          <h2 className="section-title">Understanding Futarchy</h2>
          <div className="understanding-content">
            <div className="understanding-text">
              <h3>Vote on Values, Bet on Beliefs</h3>
              <p>
                Futarchy separates what we want (values) from how to achieve it (beliefs). 
                Democratic voting establishes organizational goals, while prediction markets 
                determine which proposals are most likely to achieve those goals.
              </p>
              <p>
                This approach leverages the wisdom of crowds—those with genuine expertise 
                and information are incentivized to participate, as their knowledge directly 
                translates to market profits.
              </p>
            </div>
            <div className="understanding-visual">
              <div className="visual-box vote">
                <h4>Democratic Voting</h4>
                <p>What do we value?</p>
                <ul>
                  <li>Treasury growth</li>
                  <li>Network security</li>
                  <li>Development activity</li>
                  <li>User adoption</li>
                </ul>
              </div>
              <div className="visual-arrow">→</div>
              <div className="visual-box bet">
                <h4>Prediction Markets</h4>
                <p>Which proposals achieve our values?</p>
                <ul>
                  <li>Buy PASS if likely to succeed</li>
                  <li>Buy FAIL if likely to fail</li>
                  <li>Market prices reveal confidence</li>
                  <li>Outcomes verified by oracles</li>
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
          <p>Connect your wallet to access the Clear Path governance platform</p>
          <button onClick={onConnect} className="cta-button large">
            Connect Wallet
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-section">
              <h4>Clear Path</h4>
              <p>Institutional-grade governance through prediction markets</p>
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
              <h4>Documentation</h4>
              <ul>
                <li>User Guide</li>
                <li>Developer Docs</li>
                <li>Security Audits</li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2026 ChipprRobotics LLC. Apache License 2.0</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
