/**
 * Referral/affiliate attribution seam (spec 056, research D6).
 *
 * Records FairWins as the beneficiary of OpenSea's OWN referral/affiliate reward — never a FairWins
 * surcharge. The reward comes out of OpenSea's fee share, so attribution MUST NOT change the buyer's
 * cost or the seller's net (FR-013/FR-015). Because OpenSea's public API does not expose a stable
 * documented attribution field on the v2 write endpoints (research D6), this is deliberately a thin,
 * NO-OP-BY-DEFAULT seam: it reports the intended attribution but does not mutate the order's
 * consideration. When OpenSea's mechanism is confirmed in implementation, wire it HERE and nowhere
 * else, keeping the no-user-cost invariant.
 */

/** Resolve the configured beneficiary for a chain (per-chain override wins), or null. */
export function referralBeneficiary(config, chainId) {
  const os = config.opensea || {}
  return os.referralAddressByChain?.[Number(chainId)] || os.referralAddress || null
}

/**
 * Attribution descriptor for an order/fulfillment on `chainId`. Pure: returns what WOULD be recorded,
 * mutating nothing. `source: 'none'` when no beneficiary is configured — the safe default.
 *
 * @returns {{ beneficiary: string|null, source: 'affiliate-listing'|'referrer-fulfillment'|'none', appliedAtNoUserCost: boolean }}
 */
export function attachReferral(config, { chainId, kind }) {
  const beneficiary = referralBeneficiary(config, chainId)
  if (!beneficiary) return { beneficiary: null, source: 'none', appliedAtNoUserCost: true }
  const source = kind === 'fulfillment' ? 'referrer-fulfillment' : 'affiliate-listing'
  // Invariant: attribution is out-of-OpenSea's-fee; it never adds a consideration item that changes
  // buyer cost or seller net. This seam does not touch consideration, so the invariant holds by
  // construction until a confirmed, no-cost mechanism is wired in.
  return { beneficiary, source, appliedAtNoUserCost: true }
}
