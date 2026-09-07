/**
 * TokenNewsCard (spec 109) — recent third-party news for ONE platform asset.
 *
 * Consumes exactly one FeedReading from the newsClient seam and invents nothing:
 *   read + items      → attributed, dated, TEXT-ONLY rows whose only interaction is the external
 *                       link-out (FR-005 — no vendor markup, images or icons ever render)
 *   read + []         → the honest empty state ("no recent items") — content, not failure
 *   not-covered       → "no news source covers this asset" (resolved locally, zero network)
 *   unreadable        → a sentence + Retry, visually and verbally DISTINCT from empty (FR-003)
 *   not-configured    → renders nothing at all (module/tenant off ⇒ the surface is absent)
 *
 * News is ADVISORY-ONLY (FR-006): nothing here gates, delays or alters any value path — the card
 * is presentation over a read, mounted beside actions it never touches. Mount sites gate on
 * isFeatureEnabled('news'); the card additionally goes quiet on not-configured so a gateway
 * without the module never shows a broken affordance.
 */
import { useCallback, useEffect, useState } from 'react'
import { fetchTokenNews } from '../../lib/news/newsClient'
import { membershipChainId, MAINNET_CHAIN_ID } from '../../config/networks'
import './TokenNewsCard.css'

/** Coarse, honest age label — the vendor's own freshness varies by asset (research R3). */
export function newsAgeLabel(publishedAt, now = Date.now()) {
  const t = Date.parse(publishedAt)
  if (!Number.isFinite(t)) return ''
  const mins = Math.max(0, Math.floor((now - t) / 60_000))
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 60) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

export default function TokenNewsCard({ chainId, address = null, assetLabel = 'this asset' }) {
  const [reading, setReading] = useState(null) // null = loading
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    setReading(null)
    fetchTokenNews({ chainId, address }).then((r) => {
      if (!cancelled) setReading(r)
    })
    return () => {
      cancelled = true
    }
  }, [chainId, address, revision])

  const retry = useCallback(() => setRevision((r) => r + 1), [])

  if (reading?.state === 'not-configured') return null

  // A testnet build shows mainnet-asset news (the one honest option — spec edge case; the perps
  // testnet-notice precedent). Said in words, once, above the rows.
  const crossCohort = membershipChainId() !== MAINNET_CHAIN_ID

  return (
    <section className="token-news-card" aria-label={`News for ${assetLabel}`}>
      <h3 className="token-news-title">News</h3>
      {crossCohort && reading?.state === 'read' && (
        <p className="token-news-cohort-note">News describes the mainnet asset, not testnet balances.</p>
      )}

      {reading === null && (
        <p className="token-news-quiet" role="status">
          Loading news…
        </p>
      )}

      {reading?.state === 'not-covered' && (
        <p className="token-news-quiet">No news source covers {assetLabel}.</p>
      )}

      {reading?.state === 'unreadable' && (
        <div className="token-news-unreadable" role="status">
          <p>The news feed could not be read right now.</p>
          <button type="button" className="token-news-retry" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      {reading?.state === 'read' && reading.items.length === 0 && (
        <p className="token-news-quiet">No recent items for {assetLabel}.</p>
      )}

      {reading?.state === 'read' && reading.items.length > 0 && (
        <ul className="token-news-list">
          {reading.items.map((item) => (
            <li key={item.id || item.url} className="token-news-item">
              {/* The link is the ONLY interaction: external, attributed, plain text. */}
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="token-news-link">
                {item.title}
              </a>
              <span className="token-news-meta">
                {item.source?.name || 'Unknown source'} · {newsAgeLabel(item.publishedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
