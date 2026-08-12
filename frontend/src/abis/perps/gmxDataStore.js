/**
 * GMX v2 `DataStore` ABI subset (spec 083) — Arbitrum 42161 only.
 *
 * One read. The DataStore is GMX's key/value config store and it is the AUTHORITY for FairWins'
 * UI fee rate: `getUint(uiFeeFactorKey(receiver))` is the rate GMX itself will enforce at
 * execution, so the admin surface reads it from here rather than from any FairWins config
 * (fee-rails.md; spec-071 "authority is the contract that will act on it"). It is also where
 * `MAX_UI_FEE_FACTOR` (1e27 = 10 bps) lives.
 *
 * Key derivation is NOT in this module — it is arithmetic over these keys, and it lives with the
 * rest of the unit conversion in `lib/perps/feeUnits.js` (`gmxUiFeeFactorKey` /
 * `GMX_MAX_UI_FEE_FACTOR_KEY`). Derive it there and nowhere else: this store is a flat
 * `bytes32 → uint256` map, so a mis-derived key returns 0, which reads as "no fee configured"
 * rather than as a failed read.
 */
export const GMX_DATA_STORE_ABI = [
  'function getUint(bytes32 key) view returns (uint256)',
]

export default GMX_DATA_STORE_ABI
