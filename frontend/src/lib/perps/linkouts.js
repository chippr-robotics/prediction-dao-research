/**
 * Outbound venue links with FairWins attribution (spec 082, FR-011).
 *
 * Attribution identifiers arrive from `/v1/perps/config` (PUBLIC config — never secrets). Every
 * builder is total: with attribution unset it returns the PLAIN venue link — a missing referral
 * code must never block a member from reaching the venue (never-stranded). All links are opened
 * with rel="noopener noreferrer" by the callers and visibly marked external.
 *
 * How each venue attributes (research D3):
 *   - GMX: `?ref=<code>` on the trade URL registers the referral code on-chain for the trader —
 *     and gives the TRADER a fee discount (disclosed as a benefit, honestly).
 *   - Gains: referral link with the referrer address; the venue pays the share, no trader cost.
 *   - Hyperliquid: `/join/<code>` referral path; the separately-disclosed builder fee only ever
 *     applies after the member approves it on the venue (approveBuilderFee).
 */

const GMX_APP = 'https://app.gmx.io/#/trade/'
const GAINS_APP = 'https://gains.trade/trading'
const HL_APP = 'https://app.hyperliquid.xyz'

/** GMX: /#/trade/?ref=<code>&to=<symbol>. */
export function gmxTradeUrl(pair, attribution = {}) {
  const params = new URLSearchParams()
  if (pair?.base) params.set('market', `${pair.base}/USD`)
  if (attribution.refCode) params.set('ref', attribution.refCode)
  const qs = params.toString()
  return qs ? `${GMX_APP}?${qs}` : GMX_APP
}

/** Gains: trading app; `?ref=<address>` attributes the referrer. */
export function gainsTradeUrl(pair, attribution = {}) {
  const params = new URLSearchParams()
  if (attribution.referrer) params.set('ref', attribution.referrer)
  const qs = params.toString()
  return qs ? `${GAINS_APP}?${qs}` : GAINS_APP
}

/** Hyperliquid: /join/<code> when a referral/builder path exists, else /trade/<asset>. */
export function hyperliquidTradeUrl(pair, attribution = {}) {
  if (attribution.joinCode) return `${HL_APP}/join/${encodeURIComponent(attribution.joinCode)}`
  return pair?.base ? `${HL_APP}/trade/${encodeURIComponent(pair.base)}` : HL_APP
}

/**
 * The link for one PerpPair given the gateway's attribution config
 * (`{ gains: {referrer}, gmx: {refCode}, hyperliquid: {builderAddress, joinCode?} }`).
 */
export function tradeLinkFor(pair, attribution = {}) {
  switch (pair?.venue) {
    case 'gmx':
      return gmxTradeUrl(pair, attribution.gmx ?? {})
    case 'gains':
      return gainsTradeUrl(pair, attribution.gains ?? {})
    case 'hyperliquid':
      return hyperliquidTradeUrl(pair, attribution.hyperliquid ?? {})
    default:
      return null
  }
}
