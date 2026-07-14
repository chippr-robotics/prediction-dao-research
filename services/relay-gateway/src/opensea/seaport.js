/**
 * Seaport protocol constants for the sell-side proxy (spec 056).
 *
 * The gateway returns these to the client in the required-fees response so the SPA never hardcodes a
 * protocol address (constitution V — no hand-copied on-chain addresses). Seaport 1.6 and OpenSea's
 * conduit are deployed at the SAME address on every chain OpenSea supports (deterministic deploy), so
 * one value covers both Ethereum (1) and Polygon (137).
 */

// Seaport 1.6 canonical contract (same address on all chains).
export const SEAPORT_ADDRESS = '0x0000000000000068F116a894984e2DB1123eB395'
export const SEAPORT_VERSION = '1.6'

// OpenSea's conduit — transfers route through this so a single approval covers OpenSea listings.
export const OPENSEA_CONDUIT_KEY = '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000'
export const OPENSEA_CONDUIT_ADDRESS = '0x1E0049783F008A0085193E00003D00cd54003c71'

// OpenSea's protocol fee recipient (same across chains) — used to label a fee line as the
// marketplace fee vs. a creator royalty in the honest fee breakdown (spec 056 FR-002).
export const OPENSEA_FEE_RECIPIENT = '0x0000a26b00c1F0DF003000390027140000fAa719'

/** Only chains OpenSea's orderbook serves for us (mirrors normalize.js CHAIN_SLUGS). */
const SUPPORTED = new Set([1, 137])

/** Protocol/conduit descriptor for an order on `chainId`, or null when unsupported. */
export function seaportProtocol(chainId) {
  if (!SUPPORTED.has(Number(chainId))) return null
  return {
    protocolAddress: SEAPORT_ADDRESS,
    protocolVersion: SEAPORT_VERSION,
    conduitKey: OPENSEA_CONDUIT_KEY,
    conduitAddress: OPENSEA_CONDUIT_ADDRESS,
  }
}
