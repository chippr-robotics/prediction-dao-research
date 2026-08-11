/**
 * Venue (+ chain) badge for perp rows (spec 082). Venue identity is the primary badge; for EVM
 * venues the network name rides along, mirroring the asset-badging convention that every row on a
 * multi-network list names where it lives. Hyperliquid is a non-EVM venue: it shows its own badge
 * and NO network name — it must never be joined to the NETWORKS map (FR-012).
 */
import { PERP_VENUES, isEvmPerpVenue } from '../../config/perps'
import { NETWORKS } from '../../config/networks'

export default function PerpsVenueBadge({ venue, chainId }) {
  const meta = PERP_VENUES[venue]
  if (!meta) return null
  const networkName = isEvmPerpVenue(venue) && chainId != null ? NETWORKS[chainId]?.name : null
  return (
    <span className={`perps-venue-badge perps-venue-${venue}`}>
      <span className="perps-venue-name">{meta.shortLabel}</span>
      {networkName && <span className="perps-venue-chain">{networkName}</span>}
    </span>
  )
}
