import { useState } from 'react'
import { SHOW_ALL_ORACLE_MODELS } from '../constants/wagerDefaults'
import { LEGAL_LINKS } from '../constants/legalLinks'
import './Footer.css'

/**
 * Shared site footer (Spec 010 — US2, FR-005/006/007/008/009).
 *
 *   variant="full"      → landing-page footer (brand + Oracles/Docs/Legal/Community) + copyright.
 *   variant="condensed" → in-app footer: legal/policy links + copyright only (no marketing columns).
 *   variant="drawer"    → condensed footer restyled to sit contained at the bottom of the
 *                         wallet section drawer (same links/copyright, stacked + compact).
 *
 * The copyright year is derived from the current date so it never goes stale (FR-008),
 * and the legal links come from the single LEGAL_LINKS source so the two footers can't
 * drift and never point at the external marketing site (FR-006/009, SC-002).
 */
export default function Footer({ variant = 'full' }) {
  const year = new Date().getFullYear()
  const copyright = `© ${year} ChipprRobotics LLC. Apache License 2.0`

  if (variant === 'condensed' || variant === 'drawer') {
    const className = variant === 'drawer' ? 'app-footer app-footer--drawer' : 'app-footer'
    return (
      <footer className={className}>
        <nav className="app-footer-links" aria-label="Legal">
          {LEGAL_LINKS.map((l) => (
            <a key={l.href} href={l.href}>{l.label}</a>
          ))}
        </nav>
        <p className="app-footer-copyright">{copyright}</p>
      </footer>
    )
  }

  return (
    <footer className="landing-footer">
      <div className="container">
        <div className="footer-content">
          <div className="footer-section footer-brand">
            <FooterBrand />
            <p>P2P wager management layer with multi-oracle resolution.</p>
          </div>
          <div className="footer-section">
            <h4>Oracles</h4>
            <ul>
              <li><a href="https://polymarket.com" target="_blank" rel="noopener noreferrer">Polymarket</a></li>
              {SHOW_ALL_ORACLE_MODELS && (
                <>
                  <li><a href="https://chain.link" target="_blank" rel="noopener noreferrer">Chainlink</a></li>
                  <li><a href="https://uma.xyz" target="_blank" rel="noopener noreferrer">UMA Protocol</a></li>
                </>
              )}
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
            <h4>Legal</h4>
            <ul>
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}><a href={l.href}>{l.label}</a></li>
              ))}
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
          <p>{copyright}</p>
        </div>
      </div>
    </footer>
  )
}

/** Brand logo with a text fallback if the SVG fails to load (matches prior landing behavior). */
function FooterBrand() {
  const [logoError, setLogoError] = useState(false)
  if (logoError) {
    return <div className="footer-logo-fallback" aria-label="FairWins">FW</div>
  }
  return (
    <img
      src="/assets/logo_fairwins.svg"
      alt="FairWins"
      className="footer-logo"
      width="40"
      height="40"
      loading="lazy"
      onError={() => setLogoError(true)}
    />
  )
}
