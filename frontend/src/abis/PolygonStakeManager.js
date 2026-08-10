/**
 * Minimal Polygon PoS StakeManager ABI (spec 065). Read at runtime to compute
 * the delegation unbonding maturity: a delegator's unbond is claimable once
 * `withdrawEpoch + withdrawalDelay() <= epoch()`. Both are governance-mutable,
 * so we never hardcode them.
 */
export const POLYGON_STAKE_MANAGER_ABI = [
  'function epoch() view returns (uint256)',
  'function withdrawalDelay() view returns (uint256)',
]

export default POLYGON_STAKE_MANAGER_ABI
