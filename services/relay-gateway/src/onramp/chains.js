/**
 * chainId → Coinbase Onramp network slug (spec 060, research R4).
 *
 * Static layer of the two-layer availability gate: only mainnets Coinbase can actually deliver
 * to are mapped — testnets and the ETC family are honestly Buy-free by construction. The dynamic
 * layer (the Buy Options catalog, routes.js) then confirms the network is currently listed, so
 * a temporary Coinbase delisting drops out without a deploy. Mirrored client-side by the
 * `onramp` capability in frontend/src/config/networks.js — keep the two in sync.
 */
const SLUGS = {
  137: 'polygon',
  1: 'ethereum',
}

/** Coinbase network slug for a chainId, or null when the chain can never be onramped. */
export function slugForChain(chainId) {
  return SLUGS[chainId] ?? null
}

/** ChainIds with an onramp mapping (test + docs convenience). */
export const ONRAMP_CHAIN_IDS = Object.keys(SLUGS).map(Number)
