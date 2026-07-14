/**
 * Builder-code attribution seam (spec 057, research D9).
 *
 * Records FairWins' bytes32 builder code on every Polymarket order so attributed volume earns
 * (1) the configured builder fee and (2) a share of Polymarket's weekly USDC rewards pool.
 *
 * KEY DIFFERENCE from the OpenSea `attachReferral` seam: OpenSea's referral reward comes out of
 * OpenSea's own fee (no user cost), so that seam is a silent no-op. Polymarket's builder fee is
 * ADDITIVE — it stacks on top of the platform taker fee and is a REAL cost to the taker — so the
 * fee bps returned here feed a VISIBLE fee line in the client's cost breakdown (FR-012). This is
 * the single place attribution + fee live; wire any change HERE and nowhere else.
 *
 * Never-stranded (FR-015): when no builder code is configured, `source: 'none'` with zero fee — the
 * order still posts, just unattributed, rather than blocking trading on a revenue concern.
 */

const ZERO_BYTES32 = '0x' + '0'.repeat(64)

/**
 * Attribution + fee descriptor for an order on `chainId`. Pure — returns what WILL be attached and
 * charged; mutates nothing. Maker orders resolve to a zero builder fee (makers are kept whole,
 * research D2), matching Polymarket's maker-fee-free model.
 *
 * @param {object} config full gateway config (only .polymarket is read)
 * @param {{chainId: number|string, isMaker?: boolean}} order
 * @returns {{ builderCode: string, feeBps: number, takerFeeBps: number, makerFeeBps: number, source: 'attributed'|'none' }}
 */
export function attachBuilderCode(config, { chainId: _chainId, isMaker = false }) {
  const pm = config.polymarket || {}
  const takerFeeBps = Number(pm.takerFeeBps ?? 0)
  const makerFeeBps = Number(pm.makerFeeBps ?? 0)
  if (!pm.builderCode) {
    // Unattributed: zero code, zero fee — the order still posts (never stranded).
    return { builderCode: ZERO_BYTES32, feeBps: 0, takerFeeBps: 0, makerFeeBps: 0, source: 'none' }
  }
  return {
    builderCode: pm.builderCode,
    // The fee that actually applies to THIS order (maker => 0), fed into the client's visible breakdown.
    feeBps: isMaker ? makerFeeBps : takerFeeBps,
    takerFeeBps,
    makerFeeBps,
    source: 'attributed',
  }
}

export { ZERO_BYTES32 }
