/**
 * chainId → Coinbase Onramp network slug (spec 060, research R4).
 *
 * Static layer of the two-layer availability gate: only mainnets that could plausibly be
 * onramped are mapped — testnets are honestly Buy-free by construction. The dynamic layer
 * (the Buy Options catalog, routes.js) then confirms the network is currently listed, so a
 * network Coinbase does not (or no longer) serves drops out without a deploy. Ethereum
 * Classic is mapped on that basis: Coinbase trades ETC, but its Onramp catalog is the
 * authority — 61 shows a Buy button ONLY if the live catalog lists the network. Mirrored
 * client-side by the `onramp` capability in frontend/src/config/networks.js — keep in sync.
 *
 * Slugs here are OUR canonical spelling; catalog lookups go through normalizeNetworkKey so a
 * Coinbase spelling variant (e.g. "ethereumclassic" vs "ethereum-classic") still matches, and
 * routes echo Coinbase's OWN reported name back in mint requests and hosted URLs.
 */
const SLUGS = {
  137: 'polygon',
  1: 'ethereum',
  61: 'ethereum-classic',
}

/** Coinbase network slug for a chainId, or null when the chain can never be onramped. */
export function slugForChain(chainId) {
  return SLUGS[chainId] ?? null
}

/** Spelling-insensitive catalog key: lowercase, alphanumerics only. */
export function normalizeNetworkKey(name) {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** ChainIds with an onramp mapping (test + docs convenience). */
export const ONRAMP_CHAIN_IDS = Object.keys(SLUGS).map(Number)
