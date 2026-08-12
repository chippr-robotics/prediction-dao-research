/**
 * Perps (spec 082) — venue registry, availability, and deep links for the Perps view inside Trade.
 *
 * The Perps surface is a market-data view over three external perpetual-futures venues. Two facts
 * shape everything here:
 *
 *   1. Market data is NETWORK-TRANSPARENT (the Earn convention): the view lists every venue at
 *      once with venue/chain badges, regardless of the wallet's active chain. There is therefore
 *      no `PERPS_CHAIN_IDS` capability set on network objects — availability is a property of the
 *      BUILD COHORT + the gateway, not of the active chain.
 *   2. Hyperliquid is a NON-EVM venue (its own L1). It never gets a numeric chain id and must
 *      never reach EVM-only seams (getContractAddressForChain / wagmi / NETWORKS lookups) —
 *      the spec-061 Bitcoin precedent (FR-012). `isEvmPerpVenue` is the boundary guard.
 *
 * Cohort honesty (FR-017): every venue here is a MAINNET venue. On a testnet cohort the view does
 * not fetch or render mainnet pairs as if they were local — `perpsCohortSupported()` gates it and
 * the view discloses mainnet-only availability instead.
 */
import { membershipChainId, MAINNET_CHAIN_ID } from './networks'

/**
 * The venue registry. `chains` are display/badge facts, not resolution targets — nothing in this
 * release resolves a contract address for a venue.
 */
export const PERP_VENUES = {
  gains: {
    id: 'gains',
    label: 'Gains Network',
    shortLabel: 'Gains',
    evm: true,
    chains: [42161, 8453, 137],
    homepage: 'https://gains.trade',
  },
  gmx: {
    id: 'gmx',
    label: 'GMX',
    shortLabel: 'GMX',
    evm: true,
    chains: [42161],
    homepage: 'https://app.gmx.io',
  },
  hyperliquid: {
    id: 'hyperliquid',
    label: 'Hyperliquid',
    shortLabel: 'HL',
    evm: false, // its own L1 — never a numeric chain id (FR-012)
    chains: [],
    homepage: 'https://app.hyperliquid.xyz',
  },
}

export const PERP_VENUE_IDS = Object.keys(PERP_VENUES)

/** Boundary guard: only EVM venues may ever be joined to NETWORKS/chainId seams. */
export function isEvmPerpVenue(venueId) {
  return Boolean(PERP_VENUES[venueId]?.evm)
}

/** The gateway base URL, or '' when unset. Read at call time so tests can stub the env. */
export function perpsGatewayUrl() {
  return (import.meta.env.VITE_RELAYER_URL || '').trim().replace(/\/$/, '')
}

/**
 * Whether this BUILD's cohort may show perps market data at all: the venues are mainnet-only, so
 * a testnet cohort renders an honest mainnet-only notice instead of cross-cohort data (FR-017).
 */
export function perpsCohortSupported() {
  return membershipChainId() === MAINNET_CHAIN_ID
}

/**
 * Whether the Perps view is available: a gateway must be configured AND the cohort must be
 * mainnet. False renders the honest unavailable/testnet notice — never an empty table (FR-013).
 */
export function perpsAvailable() {
  return perpsGatewayUrl() !== '' && perpsCohortSupported()
}

/** Deep link to the Perps view (`?view=` inside the Trade section — the section/view idiom). */
export function perpsPath({ venue } = {}) {
  const params = new URLSearchParams({ tab: 'trade', view: 'perps' })
  if (venue && PERP_VENUES[venue]) params.set('venue', venue)
  return `/wallet?${params.toString()}`
}
