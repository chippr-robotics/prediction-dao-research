import { useState } from 'react'
import { useBitcoinStamps } from '../../hooks/useBitcoinStamps'
import './CollectiblesPanel.css'

function StampCard({ stamp }) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <li className="collectible-card bitcoin-stamp-card">
      <div className="collectible-card-button bitcoin-stamp-body">
        <span className="collectible-card-media">
          {stamp.imageUrl && !imageFailed ? (
            <img src={stamp.imageUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} />
          ) : (
            <span className="collectible-card-placeholder" aria-hidden="true">
              🖼
            </span>
          )}
          <span className="bitcoin-stamp-protected-badge">Protected</span>
        </span>
        <span className="collectible-card-name">{stamp.stampId}</span>
        <span className="collectible-card-collection">Bitcoin Stamp</span>
      </div>
    </li>
  )
}

/**
 * BitcoinStampsSection (spec 061, T031 — FR-017/FR-018/FR-019) — the
 * "Bitcoin Stamps" section of the Collect surface, following the spec-055
 * section pattern. Bitcoin's `collect: 'stamps-only'` capability means this
 * section renders WITHOUT any OpenSea integration: stamps are display-only
 * (v1 recognizes, displays, and protects — no transfer/mint).
 *
 * Honest states: hidden when the member has no bitcoin ledger (or the module
 * is off); an explicit degraded notice when recognition is unavailable —
 * never an endless spinner, never a confident partial gallery.
 */
export default function BitcoinStampsSection() {
  const { status, stamps, refresh } = useBitcoinStamps()

  // No bitcoin footprint, module off, or recognition healthy with zero
  // stamps: nothing to disclose — the section stays out of the page.
  if (status === 'hidden' || status === 'empty' || status === 'loading') return null

  return (
    <section className="bitcoin-stamps-section" aria-label="Bitcoin Stamps">
      <div className="collectibles-panel-header">
        <div>
          <h4>Bitcoin Stamps</h4>
          <p className="collectibles-panel-subtitle">
            Collectibles held in your Bitcoin wallet. Their value is protected: ordinary BTC sends can
            never spend the coins a Stamp travels with, so this value is excluded from your spendable
            balance.
          </p>
        </div>
      </div>

      {status === 'degraded' ? (
        <div className="collectibles-degraded" role="status">
          <p>
            Stamps recognition is temporarily degraded. Your Stamps are safe on-chain — until
            recognition recovers, unverified coins are treated as protected and cannot be spent.
          </p>
          <div className="collectibles-degraded-actions">
            <button type="button" onClick={refresh}>
              Try again
            </button>
          </div>
        </div>
      ) : (
        <ul className="collectibles-grid">
          {stamps.map((stamp) => (
            <StampCard key={`${stamp.outpoint?.txid}:${stamp.outpoint?.vout}:${stamp.stampId}`} stamp={stamp} />
          ))}
        </ul>
      )}
    </section>
  )
}
