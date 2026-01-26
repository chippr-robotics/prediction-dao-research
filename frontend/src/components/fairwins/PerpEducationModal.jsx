import { useState } from 'react'
import './PerpEducationModal.css'

/**
 * PerpEducationModal Component
 *
 * Educational "show once" modal that explains perpetual futures to new users.
 * Displays on first visit and can be permanently dismissed with checkbox.
 */
function PerpEducationModal({ isOpen, onDismiss }) {
  const [dontShowAgain, setDontShowAgain] = useState(false)

  if (!isOpen) return null

  const handleDismiss = () => {
    onDismiss(dontShowAgain)
  }

  return (
    <div className="perp-education-backdrop" onClick={handleDismiss}>
      <div className="perp-education-modal" onClick={(e) => e.stopPropagation()}>
        <header className="perp-education-header">
          <div className="perp-education-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </div>
          <h2>Introduction to Perpetual Futures</h2>
          <p className="perp-education-subtitle">Learn the basics before you start trading</p>
        </header>

        <div className="perp-education-content">
          {/* Section 1: What are Perpetual Futures */}
          <section className="perp-education-section">
            <div className="perp-education-section-header">
              <span className="perp-education-section-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3v18h18"/>
                  <path d="M18 17V9"/>
                  <path d="M13 17V5"/>
                  <path d="M8 17v-3"/>
                </svg>
              </span>
              <h3>What are Perpetual Futures?</h3>
            </div>
            <p>
              Perpetual futures are derivative contracts that allow you to speculate
              on the price of an asset <strong>without holding the underlying asset</strong>.
              Unlike traditional futures, they have <strong>no expiration date</strong> -
              you can hold positions indefinitely.
            </p>
          </section>

          {/* Section 2: How Settlement/Funding Works */}
          <section className="perp-education-section">
            <div className="perp-education-section-header">
              <span className="perp-education-section-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
              </span>
              <h3>Funding Rates</h3>
            </div>
            <p>
              To keep the perpetual contract price aligned with the spot price,
              <strong> funding payments</strong> are exchanged between long and short
              positions periodically.
            </p>
            <ul className="perp-education-list">
              <li><strong>Positive funding rate:</strong> Longs pay shorts</li>
              <li><strong>Negative funding rate:</strong> Shorts pay longs</li>
            </ul>
          </section>

          {/* Section 3: Risks */}
          <section className="perp-education-section warning">
            <div className="perp-education-section-header">
              <span className="perp-education-section-icon warning">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </span>
              <h3>Key Risks</h3>
            </div>
            <ul className="perp-education-risk-list">
              <li>
                <strong>Liquidation:</strong> If your position's margin falls below
                the maintenance requirement, it will be automatically closed (liquidated).
              </li>
              <li>
                <strong>Leverage Risk:</strong> Higher leverage amplifies both gains
                AND losses. A 10x leveraged position can be liquidated with just a 10%
                adverse price move.
              </li>
              <li>
                <strong>Funding Costs:</strong> Holding positions long-term may
                accumulate significant funding costs depending on market conditions.
              </li>
            </ul>
          </section>

          {/* Section 4: How to Trade */}
          <section className="perp-education-section">
            <div className="perp-education-section-header">
              <span className="perp-education-section-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </span>
              <h3>How to Enter &amp; Exit Positions</h3>
            </div>
            <ol className="perp-education-steps">
              <li>
                <span className="step-number">1</span>
                <span>Select a market from the <strong>Markets</strong> tab</span>
              </li>
              <li>
                <span className="step-number">2</span>
                <span>Choose <strong>Long</strong> (bullish) or <strong>Short</strong> (bearish)</span>
              </li>
              <li>
                <span className="step-number">3</span>
                <span>Enter collateral amount and set your leverage</span>
              </li>
              <li>
                <span className="step-number">4</span>
                <span>Review your position details and confirm</span>
              </li>
              <li>
                <span className="step-number">5</span>
                <span>Manage or close your position from the <strong>Positions</strong> tab</span>
              </li>
            </ol>
          </section>
        </div>

        <footer className="perp-education-footer">
          <label className="perp-education-checkbox">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            <span className="checkmark"></span>
            <span>Don't show this again</span>
          </label>
          <button className="perp-education-btn" onClick={handleDismiss}>
            I Understand, Let's Trade
          </button>
        </footer>
      </div>
    </div>
  )
}

export default PerpEducationModal
