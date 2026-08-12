/**
 * GMX v2 `DataStore` ABI subset (spec 083) — Arbitrum 42161 only.
 *
 * One read, serving two authorities.
 *
 *  1. **The FairWins UI fee rate.** `getUint(uiFeeFactorKey(receiver))` is the rate GMX itself will
 *     enforce at execution, so the admin surface reads it from here rather than from any FairWins
 *     config (fee-rails.md; spec-071 "authority is the contract that will act on it"). It is also
 *     where `MAX_UI_FEE_FACTOR` (1e27 = 10 bps) lives.
 *  2. **The keeper execution fee** every order must declare — GMX's `ESTIMATED_GAS_FEE_*` and
 *     per-order-type gas limits.
 *
 * Key derivation is NOT in this module, and each family lives with the arithmetic that consumes it:
 * the UI-fee keys in `lib/perps/feeUnits.js` (`gmxUiFeeFactorKey` / `GMX_MAX_UI_FEE_FACTOR_KEY`),
 * the execution-fee keys in `lib/perps/venues/gmx.js` beside the formula and the live read. Derive
 * a key in one of those two places and nowhere else: this store is a flat `bytes32 → uint256` map,
 * so a mis-derived key usually returns 0, which reads as "not configured" rather than as a failed
 * read — and, as the gmx.js header records, sometimes returns a plausible NON-zero value from a
 * legacy key instead, which is worse.
 */
export const GMX_DATA_STORE_ABI = [
  'function getUint(bytes32 key) view returns (uint256)',
]

export default GMX_DATA_STORE_ABI
