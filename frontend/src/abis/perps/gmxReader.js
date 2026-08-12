/**
 * GMX v2 `Reader` ABI subset (spec 083) — Arbitrum 42161 only.
 *
 * `getAccountPositions` (selector `0x77cfb162`) is the whole of what this feature reads from the
 * Reader. It returns a clean empty array for an account with no positions: absence is not an
 * error, and must never be rendered as a failed read.
 *
 * The tuple below is `Position.Props` IN FULL — all 14 words. Nothing is omitted, and nothing may
 * be: `Props` is entirely static, so a `Props[]` on the wire is a length followed by tightly
 * packed 14-word elements. Dropping a trailing field we "do not need" changes the element stride
 * and turns every position after the first into garbage that still decodes without error. The
 * shape was confirmed on 2026-08-11 by decoding a live account's positions against the deployed
 * Reader `0xfA26cBb46e2614609406de08CA1Dc7f70a684184`.
 *
 * Two fields are easy to get wrong:
 *   - `pendingImpactAmount` is **int256** (it is routinely negative). Decoding it as uint256 turns
 *     a small debit into a number near 2^256.
 *   - `increasedAtTime` / `decreasedAtTime` are TIMESTAMPS, not block numbers. Earlier GMX
 *     releases carried `increasedAtBlock` / `decreasedAtBlock` in these slots.
 *
 * SCALES: `sizeInUsd` is 1e30; `sizeInTokens` is the index token's decimals; `collateralAmount`
 * and `pendingImpactAmount` are the collateral token's decimals.
 *
 * `getAccountPositionInfoList` is deliberately absent: it returns enriched info but the CALLER
 * must supply market prices — the Reader does not fetch them — so it would only move the price
 * problem, not solve it.
 */
export const GMX_READER_ABI = [
  'function getAccountPositions(address dataStore, address account, uint256 start, uint256 end) view returns (tuple(tuple(address account, address market, address collateralToken) addresses, tuple(uint256 sizeInUsd, uint256 sizeInTokens, uint256 collateralAmount, int256 pendingImpactAmount, uint256 borrowingFactor, uint256 fundingFeeAmountPerSize, uint256 longTokenClaimableFundingAmountPerSize, uint256 shortTokenClaimableFundingAmountPerSize, uint256 increasedAtTime, uint256 decreasedAtTime) numbers, tuple(bool isLong) flags)[])',
]

export default GMX_READER_ABI
