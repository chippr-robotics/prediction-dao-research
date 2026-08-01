import { useState } from 'react'
import { SHOW_ALL_ORACLE_MODELS } from '../constants/wagerDefaults'
import { LEGAL_LINKS } from '../constants/legalLinks'
import { tenantBrand, tenantLinks } from '../config/tenant'
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
 * Brand identity, docs, and community links resolve from the tenant manifest (spec 072) —
 * columns whose links the tenant does not define are simply absent.
 */

const SOCIAL_LABELS = { x: 'Twitter / X', discord: 'Discord', github: 'GitHub' }

export default function Footer({ variant = 'full' }) {
  const brand = tenantBrand()
  const { social } = tenantLinks()
  const year = new Date().getFullYear()
  const copyright = `© ${year} ${brand.copyrightNotice}`

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

  const socialEntries = Object.entries(social).filter(([, url]) => Boolean(url))

  return (
    <footer className="landing-footer">
      <div className="container">
        <div className="footer-content">
          <div className="footer-section footer-brand">
            <FooterBrand brand={brand} />
            <p>{brand.tagline}</p>
          </div>
          <div className="footer-section">
            <h4>Integrations</h4>
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
          {brand.docsUrl && (
            <div className="footer-section">
              <h4>Docs</h4>
              <ul>
                <li><a href={`${brand.docsUrl}/user-guide/getting-started/`} target="_blank" rel="noopener noreferrer">User Guide</a></li>
                <li><a href={`${brand.docsUrl}/developer-guide/setup/`} target="_blank" rel="noopener noreferrer">Developer Docs</a></li>
                <li><a href={`${brand.docsUrl}/security/`} target="_blank" rel="noopener noreferrer">Security Audits</a></li>
              </ul>
            </div>
          )}
          <div className="footer-section">
            <h4>Legal</h4>
            <ul>
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}><a href={l.href}>{l.label}</a></li>
              ))}
            </ul>
          </div>
          {socialEntries.length > 0 && (
            <div className="footer-section">
              <h4>Community</h4>
              <ul>
                {socialEntries.map(([key, url]) => (
                  <li key={key}>
                    <a href={url} target="_blank" rel="noopener noreferrer">{SOCIAL_LABELS[key] || key}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="footer-bottom">
          <p>{copyright}</p>
        </div>
      </div>
    </footer>
  )
}

/** Brand logo with a text fallback if the SVG fails to load (matches prior landing behavior). */
function FooterBrand({ brand }) {
  const [logoError, setLogoError] = useState(false)
  if (logoError) {
    return (
      <div className="footer-logo-fallback" aria-label={brand.displayName}>
        {brand.displayName.slice(0, 2).toUpperCase()}
      </div>
    )
  }
  return (
    <img
      src={brand.logo}
      alt={brand.displayName}
      className="footer-logo"
      width="40"
      height="40"
      loading="lazy"
      onError={() => setLogoError(true)}
    />
  )
}
